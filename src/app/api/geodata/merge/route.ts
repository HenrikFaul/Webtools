import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse, GeoProvider } from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RpcMergeResult = Record<string, unknown>;
type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  return text.length > 0 ? text : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function normalizeProviders(provider: GeoProvider | "all"): GeoProvider[] {
  return provider === "all" ? ["geoapify", "tomtom"] : [provider];
}

function parseRpcPayload(data: unknown): RpcMergeResult {
  if (data && typeof data === "object" && !Array.isArray(data)) return data as RpcMergeResult;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as RpcMergeResult;
    } catch {
      return { status: "FAILED", success: false, errors: [`Database RPC returned non-JSON text: ${data.slice(0, 300)}`] };
    }
  }
  return { status: "FAILED", success: false, errors: ["Database RPC returned an empty or unsupported payload."] };
}

function normalizeRpcResult(
  data: unknown,
  provider: GeoProvider,
  countryCode: string | undefined,
  fallbackSessionId: string,
  durationMs: number,
): GeoMergeResponse {
  const payload = parseRpcPayload(data);
  const success = asBoolean(payload.success);
  const expected = asNumber(payload.expected_count);
  const found = asNumber(payload.found_count);
  const failed = asNumber(payload.failed);
  const errors = asStringArray(payload.errors);
  const retryLogs = asStringArray(payload.retry_logs);

  return {
    status: success ? "SUCCESS" : "FAILED",
    success,
    load_session_id: asString(payload.load_session_id, fallbackSessionId),
    provider,
    countryCode,
    inserted: asNumber(payload.inserted),
    updated: asNumber(payload.updated),
    skipped: asNumber(payload.skipped),
    errors,
    retry_logs: retryLogs,
    raw_source_count: asNumber(payload.raw_source_count),
    expected_count: expected,
    found_count: found,
    missing_count: Math.max(0, asNumber(payload.missing_count, expected - found)),
    upserted: asNumber(payload.upserted),
    failed,
    duplicate_source_keys: asNumber(payload.duplicate_source_keys),
    attempts: asNumber(payload.attempts, 1),
    duration_ms: asNumber(payload.duration_ms, durationMs),
  };
}

function failedResponse(
  message: string,
  provider: GeoProvider | "all" | "unknown",
  sessionId: string,
  countryCode: string | undefined,
  startedAt: number,
  status = 500,
) {
  const body: GeoMergeResponse = {
    status: "FAILED",
    success: false,
    load_session_id: sessionId,
    provider,
    countryCode,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [message],
    retry_logs: ["Merge failed before the database-side bulk merge could complete."],
    raw_source_count: 0,
    expected_count: 0,
    found_count: 0,
    missing_count: 0,
    upserted: 0,
    failed: 0,
    duplicate_source_keys: 0,
    attempts: 0,
    duration_ms: Date.now() - startedAt,
  };
  return NextResponse.json(body, { status });
}

async function readPayload(req: Request): Promise<GeoMergeRequest> {
  try {
    return (await req.json()) as GeoMergeRequest;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    throw new Error(`Invalid JSON request body for POI merge: ${message}`);
  }
}

async function runDatabaseMerge(
  sb: SupabaseAdmin,
  provider: GeoProvider,
  countryCode: string | undefined,
  sessionId: string,
): Promise<GeoMergeResponse> {
  const rpcStartedAt = Date.now();
  const { data, error } = await sb.rpc("merge_provider_pois_to_unified", {
    p_provider: provider,
    p_country_code: countryCode ?? null,
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(
      `Database merge RPC failed for ${provider}: ${error.message}. ` +
      "Run supabase/migrations/20260426164500_local_pois_self_healing_etl.sql in Supabase SQL Editor, then retry.",
    );
  }

  return normalizeRpcResult(data, provider, countryCode, sessionId, Date.now() - rpcStartedAt);
}

function aggregateResults(
  provider: GeoProvider | "all",
  countryCode: string | undefined,
  sessionId: string,
  startedAt: number,
  results: GeoMergeResponse[],
): GeoMergeResponse {
  const errors = results.flatMap((result) => result.errors);
  const retryLogs = results.flatMap((result) => result.retry_logs);
  const expected = results.reduce((sum, result) => sum + result.expected_count, 0);
  const found = results.reduce((sum, result) => sum + result.found_count, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  const success = results.length > 0 && results.every((result) => result.success) && expected === found && failed === 0;

  return {
    status: success ? "SUCCESS" : "FAILED",
    success,
    load_session_id: sessionId,
    provider,
    countryCode,
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    updated: results.reduce((sum, result) => sum + result.updated, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
    errors: success ? errors : errors.length > 0 ? errors : [`FAILED: expected ${expected}, found ${found}, failed ${failed}.`],
    retry_logs: retryLogs,
    raw_source_count: results.reduce((sum, result) => sum + result.raw_source_count, 0),
    expected_count: expected,
    found_count: found,
    missing_count: Math.max(0, expected - found),
    upserted: results.reduce((sum, result) => sum + result.upserted, 0),
    failed,
    duplicate_source_keys: results.reduce((sum, result) => sum + result.duplicate_source_keys, 0),
    attempts: Math.max(...results.map((result) => result.attempts), 0),
    duration_ms: Date.now() - startedAt,
  };
}

export async function POST(req: Request) {
  const sessionId = randomUUID();
  const startedAt = Date.now();
  let requestedProvider: GeoProvider | "all" | "unknown" = "unknown";
  let requestedCountry: string | undefined;

  try {
    const payload = await readPayload(req);
    requestedProvider = payload.provider ?? "unknown";
    requestedCountry = payload.countryCode?.trim() || undefined;

    if (!payload.provider) {
      return failedResponse("provider is required", requestedProvider, sessionId, requestedCountry, startedAt, 400);
    }
    if (!["geoapify", "tomtom", "all"].includes(payload.provider)) {
      return failedResponse("provider must be geoapify, tomtom, or all", requestedProvider, sessionId, requestedCountry, startedAt, 400);
    }

    const sb = getSupabaseAdmin();
    const providerResults: GeoMergeResponse[] = [];
    for (const provider of normalizeProviders(payload.provider)) {
      providerResults.push(await runDatabaseMerge(sb, provider, requestedCountry, sessionId));
    }

    const response = aggregateResults(payload.provider, requestedCountry, sessionId, startedAt, providerResults);
    return NextResponse.json(response, { status: response.success ? 200 : 409 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Merge failed";
    return failedResponse(message, requestedProvider, sessionId, requestedCountry, startedAt, 500);
  }
}
