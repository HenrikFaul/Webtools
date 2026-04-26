import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse, GeoProvider } from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RpcMergePayload = Partial<GeoMergeResponse> & Record<string, unknown>;

function isProvider(value: unknown): value is GeoProvider {
  return value === "geoapify" || value === "tomtom";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeRpcPayload(value: unknown, provider: GeoProvider, sessionId: string, countryCode?: string): GeoMergeResponse {
  const raw = Array.isArray(value) ? value[0] : value;
  const obj = (raw && typeof raw === "object" ? raw : {}) as RpcMergePayload;
  const errors = asStringArray(obj.errors);
  const missing = asNumber(obj.missing_count);
  const status = obj.status === "SUCCESS" && errors.length === 0 && missing === 0 ? "SUCCESS" : "FAILED";

  return {
    status,
    success: status === "SUCCESS",
    provider,
    countryCode: typeof obj.countryCode === "string" ? obj.countryCode : countryCode ?? null,
    merge_session_id: typeof obj.merge_session_id === "string" ? obj.merge_session_id : sessionId,
    raw_source_count: asNumber(obj.raw_source_count),
    expected_count: asNumber(obj.expected_count),
    found_count: asNumber(obj.found_count),
    missing_count: missing,
    inserted: asNumber(obj.inserted),
    updated: asNumber(obj.updated),
    skipped: asNumber(obj.skipped),
    duplicate_source_keys: asNumber(obj.duplicate_source_keys),
    errors,
    merge_logs: asStringArray(obj.merge_logs),
  };
}

function failed(provider: GeoProvider, sessionId: string, message: string, countryCode?: string): GeoMergeResponse {
  return {
    status: "FAILED",
    success: false,
    provider,
    countryCode: countryCode ?? null,
    merge_session_id: sessionId,
    raw_source_count: 0,
    expected_count: 0,
    found_count: 0,
    missing_count: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    duplicate_source_keys: 0,
    errors: [message],
    merge_logs: [],
  };
}

export async function POST(req: Request) {
  const sessionId = randomUUID();

  try {
    const payload = (await req.json()) as GeoMergeRequest;
    if (!isProvider(payload.provider)) {
      return NextResponse.json(failed("geoapify", sessionId, "provider must be geoapify or tomtom"), { status: 200 });
    }

    const provider = payload.provider;
    const countryCode = payload.countryCode?.trim() ? payload.countryCode.trim().toUpperCase() : undefined;
    const sb = getSupabaseAdmin();

    const { data, error } = await sb.rpc("merge_provider_pois_to_unified", {
      p_provider: provider,
      p_country_code: countryCode ?? null,
      p_session_id: sessionId,
    });

    if (error) {
      return NextResponse.json(
        failed(provider, sessionId, `Database-side merge failed: ${error.message}`, countryCode),
        { status: 200 },
      );
    }

    return NextResponse.json(normalizeRpcPayload(data, provider, sessionId, countryCode), { status: 200 });
  } catch (err) {
    return NextResponse.json(
      failed("geoapify", sessionId, err instanceof Error ? err.message : "Merge failed"),
      { status: 200 },
    );
  }
}
