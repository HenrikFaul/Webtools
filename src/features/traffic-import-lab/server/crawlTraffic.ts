import { isBlockedNetworkTarget } from "@/lib/security";
import type { RequestManifestEntry, TrafficImportResponse } from "@/types/trafficImport";

function entryFromUrl(url: string, idx: number, source: string, status?: number): RequestManifestEntry {
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    // keep root fallback
  }

  return {
    id: `crawl-${idx}`,
    label: url,
    sourceMode: "runtime_browser",
    confidence: 0.7,
    resolvedUrl: url,
    pathTemplate: path,
    method: "GET",
    headersTemplate: {},
    queryTemplate: {},
    possibleEnvironmentVariables: [],
    callChain: [],
    observedStatuses: status ? [status] : [],
    responseShapeHints: [],
    sourceEvidence: [{ type: "runtime", detail: source }],
    needsReview: false,
    normalizationWarnings: ["Runtime crawl fallback uses document and HTML extraction rather than full browser automation."],
    runtimeObservedStatus: "observed",
    captureConfidence: "medium",
    specCoverageStatus: "unknown",
    browserContextRequiredStatus: "likely_required",
    clientWrapperMutationStatus: "unknown",
    authInjectionSourceStatus: "unknown",
    auditVerdict: "ok"
  };
}

export async function crawlTraffic(url: string): Promise<TrafficImportResponse> {
  if (isBlockedNetworkTarget(url)) {
    return {
      summary: "Crawl blocked by SSRF guardrails.",
      entries: [],
      warnings: ["Target URL is private, localhost, or invalid."]
    };
  }

  const warnings: string[] = [];
  const entries: RequestManifestEntry[] = [];

  const response = await fetch(url, { cache: "no-store" });
  const html = await response.text();

  entries.push(entryFromUrl(url, 1, "Fetched document URL during fallback crawl", response.status));

  const matches = Array.from(
    new Set((html.match(/https?:\/\/[^"'\s)]+/g) ?? []).filter((candidate) => candidate.includes("/api") || candidate.includes("/graphql")))
  );

  for (const [idx, found] of matches.entries()) {
    entries.push(entryFromUrl(found, idx + 2, "Extracted candidate API URL from HTML fallback crawl"));
  }

  if (!matches.length) {
    warnings.push("No explicit API or GraphQL URLs were found in the HTML fallback crawl.");
  }

  warnings.push("Live URL crawl is running in fallback mode without Playwright, so runtime fetch/XHR visibility is limited in this environment.");

  return {
    summary: `Fallback crawl found ${entries.length} candidate request(s).`,
    entries,
    warnings
  };
}
