import { isBlockedNetworkTarget, redactHeaderValue, safeBodyPreview } from "@/lib/security";
import type { TraceHop, TraceRequestPayload, TraceResponsePayload } from "@/types/requestTrace";

const TIMEOUT_MS = 8000;

function parseHeaders(headersJson?: string): Record<string, string> {
  if (!headersJson?.trim()) return {};
  try {
    const parsed = JSON.parse(headersJson) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}

function resolveRedirect(currentUrl: string, location: string): string {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return currentUrl;
  }
}

export async function runTraceRequest(payload: TraceRequestPayload): Promise<TraceResponsePayload> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const maxHops = Math.min(Math.max(payload.maxHops ?? 5, 1), 10);

  if (isBlockedNetworkTarget(payload.url)) {
    return {
      startedAt,
      finalUrl: payload.url,
      totalElapsedMs: 0,
      summary: "Blocked by SSRF guardrails (localhost/private network).",
      hops: [{
        hop: 1,
        url: payload.url,
        method: payload.method,
        status: null,
        elapsedMs: 0,
        requestHeaders: {},
        error: "Blocked URL"
      }]
    };
  }

  const baseHeaders = parseHeaders(payload.headersJson);
  const hops: TraceHop[] = [];
  let currentUrl = payload.url;

  for (let hop = 1; hop <= maxHops; hop += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const hopStarted = Date.now();

    try {
      const response = await fetch(currentUrl, {
        method: payload.method,
        headers: baseHeaders,
        body: payload.method === "GET" ? undefined : payload.body,
        redirect: payload.followRedirects ? "follow" : "manual",
        cache: "no-store",
        signal: controller.signal
      });

      const location = response.headers.get("location") ?? undefined;
      const responseBody = await response.text();
      const requestPreview = Object.fromEntries(Object.entries(baseHeaders).map(([k, v]) => [k, redactHeaderValue(k, v)]));

      hops.push({
        hop,
        url: currentUrl,
        method: payload.method,
        status: response.status,
        location,
        elapsedMs: Date.now() - hopStarted,
        requestHeaders: requestPreview,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseBodyPreview: safeBodyPreview(responseBody)
      });

      if (!location || payload.followRedirects) {
        currentUrl = response.url;
        break;
      }

      currentUrl = resolveRedirect(currentUrl, location);
    } catch (error) {
      const requestPreview = Object.fromEntries(Object.entries(baseHeaders).map(([k, v]) => [k, redactHeaderValue(k, v)]));
      hops.push({
        hop,
        url: currentUrl,
        method: payload.method,
        status: null,
        elapsedMs: Date.now() - hopStarted,
        requestHeaders: requestPreview,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  const summary = hops.length === 0
    ? "No hops executed."
    : `Captured ${hops.length} hop(s). Final status: ${hops[hops.length - 1]?.status ?? "error"}.`;

  return {
    startedAt,
    finalUrl: hops[hops.length - 1]?.url ?? payload.url,
    totalElapsedMs: Date.now() - startedMs,
    hops,
    summary
  };
}
