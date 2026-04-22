import type { RequestManifestEntry } from "@/types/trafficImport";

const FETCH_RE = /fetch\(([^\)]+)\)/g;
const AXIOS_RE = /axios\.(get|post|put|patch|delete)\(([^\)]+)\)/g;
const AXIOS_CREATE_RE = /axios\.create\(\{[^}]*baseURL\s*:\s*([^,\n}]+)/g;
const SWR_RE = /useSWR\(([^\)]+)\)/g;
const QUERY_RE = /queryKey\s*:\s*\[([^\]]+)\]/g;
const ENV_RE = /process\.env\.([A-Z0-9_]+)/g;

function extractUrl(raw: string): string {
  return raw.replace(/["'`]/g, "").split(",")[0]?.trim() ?? "";
}

function baseEntry(partial: Partial<RequestManifestEntry> & Pick<RequestManifestEntry, "id" | "label" | "method" | "pathTemplate" | "resolvedUrl">): RequestManifestEntry {
  return {
    sourceMode: "repo_static",
    confidence: 0.6,
    headersTemplate: {},
    queryTemplate: {},
    possibleEnvironmentVariables: [],
    callChain: [],
    observedStatuses: [],
    responseShapeHints: [],
    sourceEvidence: [{ type: "repo", detail: "AST-like heuristic static analysis" }],
    needsReview: true,
    normalizationWarnings: ["Inferred from source patterns; runtime wrappers may change final request."],
    runtimeObservedStatus: "inferred",
    captureConfidence: "medium",
    specCoverageStatus: "unknown",
    browserContextRequiredStatus: "unknown",
    clientWrapperMutationStatus: "likely_mutated",
    authInjectionSourceStatus: "unknown",
    auditVerdict: "needs_review",
    ...partial
  };
}

export function analyzeRepoText(rawInput: string): RequestManifestEntry[] {
  const entries: RequestManifestEntry[] = [];
  const envVars = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ENV_RE.exec(rawInput)) !== null) envVars.add(match[1]);

  while ((match = FETCH_RE.exec(rawInput)) !== null) {
    const urlRaw = extractUrl(match[1] ?? "");
    entries.push(baseEntry({
      id: `repo-fetch-${entries.length + 1}`,
      label: `fetch ${urlRaw}`,
      method: "GET",
      resolvedUrl: urlRaw,
      pathTemplate: urlRaw,
      possibleEnvironmentVariables: Array.from(envVars)
    }));
  }

  while ((match = AXIOS_RE.exec(rawInput)) !== null) {
    const method = (match[1] ?? "get").toUpperCase();
    const urlRaw = extractUrl(match[2] ?? "");
    entries.push(baseEntry({
      id: `repo-axios-${entries.length + 1}`,
      label: `axios ${method} ${urlRaw}`,
      method,
      resolvedUrl: urlRaw,
      pathTemplate: urlRaw,
      possibleEnvironmentVariables: Array.from(envVars)
    }));
  }

  while ((match = AXIOS_CREATE_RE.exec(rawInput)) !== null) {
    const base = extractUrl(match[1] ?? "");
    entries.push(baseEntry({
      id: `repo-axios-base-${entries.length + 1}`,
      label: `axios.create baseURL ${base}`,
      method: "GET",
      resolvedUrl: base,
      pathTemplate: base,
      normalizationWarnings: ["Detected axios.create baseURL; downstream path composition likely dynamic."],
      possibleEnvironmentVariables: Array.from(envVars)
    }));
  }

  while ((match = SWR_RE.exec(rawInput)) !== null) {
    const key = extractUrl(match[1] ?? "");
    entries.push(baseEntry({
      id: `repo-swr-${entries.length + 1}`,
      label: `useSWR ${key}`,
      method: "GET",
      resolvedUrl: key,
      pathTemplate: key,
      normalizationWarnings: ["Detected SWR key; transport method may be wrapper-defined."],
      possibleEnvironmentVariables: Array.from(envVars)
    }));
  }

  while ((match = QUERY_RE.exec(rawInput)) !== null) {
    const queryKey = extractUrl(match[1] ?? "");
    entries.push(baseEntry({
      id: `repo-query-${entries.length + 1}`,
      label: `tanstack-query ${queryKey}`,
      method: "GET",
      resolvedUrl: queryKey,
      pathTemplate: queryKey,
      normalizationWarnings: ["Detected TanStack Query key; verify actual fetcher/request method."],
      possibleEnvironmentVariables: Array.from(envVars)
    }));
  }

  return entries;
}
