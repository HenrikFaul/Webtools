export type TrafficSourceMode =
  | "runtime_browser"
  | "proxy_capture"
  | "repo_static"
  | "har_import"
  | "openapi_import"
  | "manual";

export interface SourceEvidence {
  type: "runtime" | "repo" | "har" | "openapi" | "manual";
  detail: string;
}

export interface RequestManifestEntry {
  id: string;
  label: string;
  sourceMode: TrafficSourceMode;
  confidence: number;
  baseUrl?: string;
  resolvedUrl?: string;
  pathTemplate: string;
  method: string;
  headersTemplate: Record<string, string>;
  queryTemplate: Record<string, string>;
  bodyTemplate?: string;
  contentType?: string;
  authStyle?: string;
  tokenPlacement?: string;
  possibleEnvironmentVariables: string[];
  initiator?: string;
  callChain: string[];
  triggerContext?: string;
  observedStatuses: number[];
  responseShapeHints: string[];
  sourceEvidence: SourceEvidence[];
  needsReview: boolean;
  normalizationWarnings: string[];
  runtimeObservedStatus: "observed" | "inferred" | "unknown";
  captureConfidence: "high" | "medium" | "low";
  specCoverageStatus: "spec_backed" | "not_spec_backed" | "unknown";
  browserContextRequiredStatus: "likely_required" | "not_required" | "unknown";
  clientWrapperMutationStatus: "likely_mutated" | "not_detected" | "unknown";
  authInjectionSourceStatus: "header" | "query" | "cookie" | "unknown";
}

export interface TrafficImportRequest {
  mode: TrafficSourceMode;
  rawInput: string;
  baseUrl?: string;
}

export interface TrafficImportResponse {
  summary: string;
  entries: RequestManifestEntry[];
  warnings: string[];
}

export interface ManifestReplayRequest {
  entries: RequestManifestEntry[];
  headerName: string;
  headerValue: string;
  defaultMethod?: string;
}

export interface ManifestReplayResult {
  id: string;
  label: string;
  url: string;
  verdict: "pass" | "warn" | "fail";
  verdictReason: string;
}

export interface ManifestReplayResponse {
  summary: string;
  results: ManifestReplayResult[];
}
