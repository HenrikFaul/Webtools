import { isBlockedNetworkTarget } from "@/lib/security";
import type { RequestManifestEntry, TrafficImportResponse } from "@/types/trafficImport";

const DEFAULT_WHITELIST = ["vercel.app", "localhost", "127.0.0.1"];

function isWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const envWhitelist = (process.env.CRAWL_DOMAIN_WHITELIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const whitelist = envWhitelist.length ? envWhitelist : DEFAULT_WHITELIST;
    return whitelist.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

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

  if (!isWhitelisted(url)) {
    return {
      summary: "Crawl blocked by domain whitelist policy.",
      entries: [],
      warnings: ["Add domain to CRAWL_DOMAIN_WHITELIST to allow crawling in this environment."]
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
  warnings.push("Whitelist policy is active for runtime auditing via CRAWL_DOMAIN_WHITELIST.");

  return {
    summary: `Fallback crawl found ${entries.length} candidate request(s).`,
    entries,
    warnings
  };
}
