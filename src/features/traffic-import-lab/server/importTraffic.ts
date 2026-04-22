import type { RequestManifestEntry, TrafficImportRequest, TrafficImportResponse } from "@/types/trafficImport";

function inferAudit(entry: Partial<RequestManifestEntry>): RequestManifestEntry["auditVerdict"] {
  if (!entry.resolvedUrl && !(entry.pathTemplate ?? "").startsWith("/")) return "invalid_endpoint_structure";
  if (entry.method === "GET" && (entry.bodyTemplate ?? "").trim()) return "likely_wrong_method";
  if (!Object.keys(entry.headersTemplate ?? {}).length) return "likely_missing_header";
  return "needs_review";
}

function makeEntry(partial: Partial<RequestManifestEntry> & Pick<RequestManifestEntry, "id" | "label" | "sourceMode" | "pathTemplate" | "method">): RequestManifestEntry {
  return {
    confidence: 0.5,
    headersTemplate: {},
    queryTemplate: {},
    possibleEnvironmentVariables: [],
    callChain: [],
    observedStatuses: [],
    responseShapeHints: [],
    sourceEvidence: [],
    needsReview: true,
    normalizationWarnings: [],
    runtimeObservedStatus: "unknown",
    captureConfidence: "medium",
    specCoverageStatus: "unknown",
    browserContextRequiredStatus: "unknown",
    clientWrapperMutationStatus: "unknown",
    authInjectionSourceStatus: "unknown",
    auditVerdict: inferAudit(partial),
    ...partial
  };
}

function parseHar(rawInput: string): RequestManifestEntry[] {
  const entries: RequestManifestEntry[] = [];
  try {
    const parsed = JSON.parse(rawInput) as { log?: { entries?: Array<{ request?: { method?: string; url?: string; headers?: Array<{ name: string; value: string }> }; response?: { status?: number } }> } };
    for (const item of parsed.log?.entries ?? []) {
      const req = item.request;
      if (!req?.url) continue;
      entries.push(makeEntry({
        id: `har-${entries.length + 1}`,
        label: req.url,
        sourceMode: "har_import",
        resolvedUrl: req.url,
        pathTemplate: new URL(req.url).pathname,
        method: req.method ?? "GET",
        headersTemplate: Object.fromEntries((req.headers ?? []).map((h) => [h.name, h.value])),
        observedStatuses: item.response?.status ? [item.response.status] : [],
        sourceEvidence: [{ type: "har", detail: "Imported from HAR entry" }],
        runtimeObservedStatus: "observed",
        captureConfidence: "high",
        needsReview: false,
        auditVerdict: "ok"
      }));
    }
  } catch {
    return [];
  }
  return entries;
}

function parseOpenApi(rawInput: string, baseUrl?: string): RequestManifestEntry[] {
  const entries: RequestManifestEntry[] = [];
  try {
    const parsed = JSON.parse(rawInput) as { paths?: Record<string, Record<string, unknown>>; servers?: Array<{ url?: string }> };
    const serverUrl = parsed.servers?.[0]?.url ?? baseUrl;
    for (const [path, methods] of Object.entries(parsed.paths ?? {})) {
      for (const method of Object.keys(methods ?? {})) {
        entries.push(makeEntry({
          id: `spec-${entries.length + 1}`,
          label: `${method.toUpperCase()} ${path}`,
          sourceMode: "openapi_import",
          baseUrl: serverUrl,
          resolvedUrl: serverUrl ? `${serverUrl.replace(/\/+$/, "")}${path}` : undefined,
          pathTemplate: path,
          method: method.toUpperCase(),
          sourceEvidence: [{ type: "openapi", detail: "Derived from OpenAPI path item" }],
          specCoverageStatus: "spec_backed",
          captureConfidence: "high",
          needsReview: false,
          auditVerdict: "ok"
        }));
      }
    }
  } catch {
    return [];
  }
  return entries;
}

function parseManual(rawInput: string): RequestManifestEntry[] {
  return rawInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, idx) => {
    const [methodMaybe, urlMaybe] = line.split(" ");
    const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes((methodMaybe || "").toUpperCase()) ? methodMaybe.toUpperCase() : "GET";
    const resolvedUrl = method === "GET" ? (urlMaybe ?? methodMaybe) : urlMaybe;
    let path = "/";
    try { path = new URL(resolvedUrl).pathname; } catch {}
    return makeEntry({
      id: `manual-${idx + 1}`,
      label: line,
      sourceMode: "manual",
      resolvedUrl,
      pathTemplate: path,
      method,
      sourceEvidence: [{ type: "manual", detail: "User supplied line import" }],
      needsReview: true,
      captureConfidence: "medium"
    });
  });
}

export function importTraffic(payload: TrafficImportRequest): TrafficImportResponse {
  let entries: RequestManifestEntry[] = [];
  const warnings: string[] = [];

  if (payload.mode === "har_import") entries = parseHar(payload.rawInput);
  if (payload.mode === "openapi_import") entries = parseOpenApi(payload.rawInput, payload.baseUrl);
  if (payload.mode === "manual") entries = parseManual(payload.rawInput);
  if (payload.mode === "runtime_browser") {
    warnings.push("Use /api/crawl-traffic for live URL crawling. Current import parses pasted runtime lines.");
    entries = parseManual(payload.rawInput).map((e) => ({ ...e, sourceMode: "runtime_browser", runtimeObservedStatus: "observed", auditVerdict: "ok" }));
  }

  if (!entries.length) {
    warnings.push("No entries were extracted. Check format and ensure JSON is valid for HAR/OpenAPI.");
  }

  return {
    summary: `Imported ${entries.length} request manifest entr${entries.length === 1 ? "y" : "ies"}.`,
    entries,
    warnings
  };
}
