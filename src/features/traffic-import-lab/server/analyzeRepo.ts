import type { RequestManifestEntry } from "@/types/trafficImport";

const FETCH_RE = /fetch\(([^\)]+)\)/g;
const AXIOS_RE = /axios\.(get|post|put|patch|delete)\(([^\)]+)\)/g;

function extractUrl(raw: string): string {
  return raw.replace(/["'`]/g, "").split(",")[0]?.trim() ?? "";
}

export function analyzeRepoText(rawInput: string): RequestManifestEntry[] {
  const entries: RequestManifestEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = FETCH_RE.exec(rawInput)) !== null) {
    const urlRaw = extractUrl(match[1] ?? "");
    entries.push({
      id: `repo-fetch-${entries.length + 1}`,
      label: `fetch ${urlRaw}`,
      sourceMode: "repo_static",
      confidence: 0.65,
      resolvedUrl: urlRaw,
      pathTemplate: urlRaw,
      method: "GET",
      headersTemplate: {},
      queryTemplate: {},
      possibleEnvironmentVariables: urlRaw.includes("process.env") ? [urlRaw] : [],
      callChain: [],
      observedStatuses: [],
      responseShapeHints: [],
      sourceEvidence: [{ type: "repo", detail: "Regex-based static pattern match for fetch()" }],
      needsReview: true,
      normalizationWarnings: ["Static inference only; runtime wrappers/interceptors may mutate request."],
      runtimeObservedStatus: "inferred",
      captureConfidence: "medium",
      specCoverageStatus: "unknown",
      browserContextRequiredStatus: "unknown",
      clientWrapperMutationStatus: "likely_mutated",
      authInjectionSourceStatus: "unknown"
    });
  }

  while ((match = AXIOS_RE.exec(rawInput)) !== null) {
    const method = (match[1] ?? "get").toUpperCase();
    const urlRaw = extractUrl(match[2] ?? "");
    entries.push({
      id: `repo-axios-${entries.length + 1}`,
      label: `axios ${method} ${urlRaw}`,
      sourceMode: "repo_static",
      confidence: 0.75,
      resolvedUrl: urlRaw,
      pathTemplate: urlRaw,
      method,
      headersTemplate: {},
      queryTemplate: {},
      possibleEnvironmentVariables: urlRaw.includes("process.env") ? [urlRaw] : [],
      callChain: [],
      observedStatuses: [],
      responseShapeHints: [],
      sourceEvidence: [{ type: "repo", detail: "Regex-based static pattern match for axios" }],
      needsReview: true,
      normalizationWarnings: ["Static inference only; verify final URL/baseURL composition."],
      runtimeObservedStatus: "inferred",
      captureConfidence: "medium",
      specCoverageStatus: "unknown",
      browserContextRequiredStatus: "unknown",
      clientWrapperMutationStatus: "likely_mutated",
      authInjectionSourceStatus: "unknown"
    });
  }

  return entries;
}
