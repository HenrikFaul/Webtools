import { normalizeSupabaseTarget } from "@/lib/normalization";
import { isBlockedNetworkTarget, redactHeaderValue, safeBodyPreview } from "@/lib/security";
import type { DiagnosisBlock, KeyInspection, ProbeResult, ValidateRequest, ValidateResponse } from "@/types/diagnostics";

const REQUEST_TIMEOUT_MS = 8000;

function inspectKey(headerValue: string): KeyInspection {
  const warnings: string[] = [];
  const jwtParts = headerValue.split(".");
  if (jwtParts.length !== 3) {
    return { isJwt: false, warnings: ["Value does not look like a JWT; this may still be valid for API-key headers."] };
  }

  try {
    const decode = (segment: string) => JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    const header = decode(jwtParts[0]);
    const claims = decode(jwtParts[1]);
    const role = typeof claims.role === "string" ? claims.role : undefined;
    if (role && !["service_role", "anon"].includes(role)) {
      warnings.push("JWT role is uncommon for Supabase API-key usage.");
    }
    if (claims.exp && Date.now() / 1000 > Number(claims.exp)) {
      warnings.push("JWT appears expired.");
    }
    return {
      isJwt: true,
      algorithm: String(header.alg ?? "unknown"),
      tokenTypeHint: role ? `supabase-${role}` : "jwt-unknown-role",
      claims,
      warnings
    };
  } catch {
    return { isJwt: false, warnings: ["Token looked JWT-like but failed decode."] };
  }
}

async function runProbe(url: string, method: string, headers: HeadersInit, body: string | undefined, label: string, followRedirects: boolean): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  const requestHeadersPreview = Object.fromEntries(
    Object.entries(headers as Record<string, string>).map(([k, v]) => [k, redactHeaderValue(k, String(v))])
  );

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : body,
      signal: controller.signal,
      redirect: followRedirects ? "follow" : "manual",
      cache: "no-store"
    });
    const text = await response.text();
    return {
      label,
      method,
      url,
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - started,
      requestHeadersPreview,
      requestBodyPreview: safeBodyPreview(body),
      responseHeadersPreview: Object.fromEntries(response.headers.entries()),
      responseBodyPreview: safeBodyPreview(text)
    };
  } catch (error) {
    return {
      label,
      method,
      url,
      status: null,
      ok: false,
      elapsedMs: Date.now() - started,
      requestHeadersPreview,
      requestBodyPreview: safeBodyPreview(body),
      error: error instanceof Error ? error.message : "Unknown error"
    };
  } finally {
    clearTimeout(timer);
  }
}

function makeDiagnosis(probes: ProbeResult[], originalMethod: string, inspection: KeyInspection): DiagnosisBlock {
  const steps = probes.map((p) => `${p.label}: ${p.status ?? "ERR"}`);
  const anyNon404 = probes.some((p) => p.status !== null && p.status !== 404);
  const routeReachable = probes.some((p) => p.status !== null && [200, 400, 401, 403, 405, 422].includes(p.status));
  const hasBadPayloadSignal = probes.some((p) => p.status === 400 || p.status === 422);
  const original = probes.find((p) => p.label === "initial");
  const alternateMethodBetter = probes.some((p) => p.method !== originalMethod && p.status !== null && p.status !== 404 && p.status !== 405);

  const noAuthProbe = probes.find((p) => p.label === "post-empty-json-no-auth");
  const withAuthProbe = probes.find((p) => p.label === "post-empty-json");
  const withAuthStatus = withAuthProbe?.status;
  const withoutAuthStatus = noAuthProbe?.status;

  let authStatus: DiagnosisBlock["authStatus"] = "unknown";
  if (inspection.warnings.some((w) => w.includes("role"))) {
    authStatus = "likely_wrong_token_type";
  } else if (withAuthStatus === 401 || withAuthStatus === 403) {
    authStatus = "likely_invalid";
  } else if (
    typeof withAuthStatus === "number" &&
    typeof withoutAuthStatus === "number" &&
    withAuthStatus !== withoutAuthStatus &&
    withAuthStatus < 500
  ) {
    authStatus = "valid";
  } else if (
    typeof withAuthStatus === "number" &&
    typeof withoutAuthStatus === "number" &&
    withAuthStatus === withoutAuthStatus
  ) {
    authStatus = "unknown";
  } else if (routeReachable) {
    authStatus = "valid";
  }

  return {
    endpointExistence: anyNon404 ? "confirmed_exists" : "likely_missing_or_function_returned_404",
    authStatus,
    methodStatus: alternateMethodBetter ? "likely_wrong" : original && original.status !== 405 ? "correct_or_accepted" : "unknown",
    payloadStatus: hasBadPayloadSignal ? "likely_invalid_or_missing" : routeReachable ? "accepted_or_not_needed" : "unknown",
    summary: anyNon404
      ? "Target appears reachable; review auth/method/payload cards to isolate failure source."
      : "All probes returned 404 or transport errors. This can still be an application-level 404 emitted by the function.",
    steps,
    probeComparison: [
      `Original method: ${originalMethod}`,
      `Auth probe with key: ${withAuthStatus ?? "n/a"}`,
      `Auth probe without key: ${withoutAuthStatus ?? "n/a"}`,
      `Best non-404 probe: ${probes.find((p) => p.status && p.status !== 404)?.label ?? "none"}`,
      `Probe count: ${probes.length}`
    ]
  };
}

export async function runValidation(request: ValidateRequest): Promise<ValidateResponse> {
  const inspection = inspectKey(request.headerValue);
  const normalizedTarget = request.mode === "supabase-edge-function"
    ? normalizeSupabaseTarget(request.baseUrl ?? "", request.functionPath ?? "").normalizedTarget
    : (request.targetUrl ?? "").trim();

  if (isBlockedNetworkTarget(normalizedTarget)) {
    return {
      normalizedTarget,
      verdict: "fail",
      verdictReason: "Blocked target: localhost/private-network addresses are not allowed.",
      keyInspection: inspection,
      probes: [],
      diagnosis: {
        endpointExistence: "unknown",
        authStatus: "unknown",
        methodStatus: "unknown",
        payloadStatus: "unknown",
        summary: "Validation blocked by SSRF safeguards.",
        steps: ["Target URL rejected before outbound request."],
        probeComparison: []
      }
    };
  }

  const headers: Record<string, string> = {
    [request.headerName]: request.headerValue,
    "content-type": "application/json"
  };

  if (request.duplicateBearerAuth) {
    headers.Authorization = `Bearer ${request.headerValue}`;
  }

  if (request.extraHeadersJson) {
    try {
      Object.assign(headers, JSON.parse(request.extraHeadersJson));
    } catch {
      // ignore malformed optional JSON
    }
  }

  const probes: ProbeResult[] = [];
  probes.push(await runProbe(normalizedTarget, request.method, headers, request.requestBody, "initial", Boolean(request.followRedirects)));

  if (request.mode === "supabase-edge-function") {
    probes.push(await runProbe(normalizedTarget, "GET", headers, undefined, "get-no-body", Boolean(request.followRedirects)));
    probes.push(await runProbe(normalizedTarget, "POST", headers, request.requestBody, "post-user-body", Boolean(request.followRedirects)));
    probes.push(await runProbe(normalizedTarget, "POST", headers, "{}", "post-empty-json", Boolean(request.followRedirects)));

    const noAuthHeaders: Record<string, string> = { "content-type": "application/json" };
    probes.push(await runProbe(normalizedTarget, "POST", noAuthHeaders, "{}", "post-empty-json-no-auth", Boolean(request.followRedirects)));
  }

  const diagnosis = makeDiagnosis(probes, request.method, inspection);
  const verdict: ValidateResponse["verdict"] = probes.some((p) => p.ok)
    ? "pass"
    : diagnosis.authStatus === "likely_invalid" || diagnosis.authStatus === "likely_wrong_token_type"
      ? "fail"
      : probes.some((p) => p.status && p.status < 500)
        ? "warn"
        : "fail";

  return {
    normalizedTarget,
    verdict,
    verdictReason: diagnosis.summary,
    keyInspection: inspection,
    probes,
    diagnosis
  };
}
