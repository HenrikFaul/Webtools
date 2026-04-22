export interface TraceRequestPayload {
  url: string;
  method: string;
  headersJson?: string;
  body?: string;
  followRedirects?: boolean;
  maxHops?: number;
}

export interface TraceHop {
  hop: number;
  url: string;
  method: string;
  status: number | null;
  location?: string;
  elapsedMs: number;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responseBodyPreview?: string;
  error?: string;
}

export interface TraceResponsePayload {
  startedAt: string;
  finalUrl: string;
  totalElapsedMs: number;
  hops: TraceHop[];
  summary: string;
}
