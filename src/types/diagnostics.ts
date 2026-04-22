export type LabMode = "supabase-edge-function" | "generic-header-check";

export type DiagnosticStatus =
  | "confirmed_exists"
  | "likely_missing_or_function_returned_404"
  | "unknown"
  | "valid"
  | "likely_invalid"
  | "likely_wrong_token_type"
  | "correct_or_accepted"
  | "likely_wrong"
  | "accepted_or_not_needed"
  | "likely_invalid_or_missing";

export interface ValidateRequest {
  mode: LabMode;
  baseUrl?: string;
  functionPath?: string;
  targetUrl?: string;
  method: string;
  headerName: string;
  headerValue: string;
  duplicateBearerAuth?: boolean;
  extraHeadersJson?: string;
  requestBody?: string;
  followRedirects?: boolean;
}

export interface ProbeResult {
  label: string;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  elapsedMs: number;
  requestHeadersPreview: Record<string, string>;
  requestBodyPreview?: string;
  responseHeadersPreview?: Record<string, string>;
  responseBodyPreview?: string;
  error?: string;
}

export interface DiagnosisBlock {
  endpointExistence: DiagnosticStatus;
  authStatus: DiagnosticStatus;
  methodStatus: DiagnosticStatus;
  payloadStatus: DiagnosticStatus;
  summary: string;
  steps: string[];
  probeComparison: string[];
}

export interface KeyInspection {
  isJwt: boolean;
  algorithm?: string;
  tokenTypeHint?: string;
  claims?: Record<string, unknown>;
  warnings: string[];
}

export interface ValidateResponse {
  normalizedTarget: string;
  verdict: "pass" | "warn" | "fail";
  verdictReason: string;
  diagnosis?: DiagnosisBlock;
  keyInspection: KeyInspection;
  probes: ProbeResult[];
}

export interface SupabaseFunctionInventoryItem {
  id: string;
  name: string;
  slug: string;
  version?: number;
  status?: string;
  entrypointPath: string;
  normalizedInvokeUrl: string;
  methodHints: string[];
  probeSummary: Record<string, number | null>;
  requestExample: string;
  responseExample: string;
}

export interface SupabaseFunctionInventoryResponse {
  projectRef: string;
  count: number;
  items: SupabaseFunctionInventoryItem[];
  warning?: string;
}
