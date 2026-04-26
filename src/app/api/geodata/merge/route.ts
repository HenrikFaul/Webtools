import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse, GeoProvider } from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MERGE_CHUNK_SIZE = 1000;
const MAX_CHUNKS = 1000;

type RpcPayload = Record<string, unknown>;
type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

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

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function asObject(value: unknown): RpcPayload {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && typeof raw === "object" ? (raw as RpcPayload) : {};
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

function responseFrom(params: {
  provider: GeoProvider;
  countryCode?: string;
  sessionId: string;
  status: "SUCCESS" | "FAILED";
  rawSourceCount: number;
  expectedCount: number;
  foundCount: number;
  missingCount: number;
  inserted: number;
  skipped: number;
  duplicateSourceKeys: number;
  errors: string[];
  logs: string[];
}): GeoMergeResponse {
  return {
    status: params.status,
    success: params.status === "SUCCESS" && params.errors.length === 0 && params.missingCount === 0,
    provider: params.provider,
    countryCode: params.countryCode ?? null,
    merge_session_id: params.sessionId,
    raw_source_count: params.rawSourceCount,
    expected_count: params.expectedCount,
    found_count: params.foundCount,
    missing_count: params.missingCount,
    inserted: params.inserted,
    updated: 0,
    skipped: params.skipped,
    duplicate_source_keys: params.duplicateSourceKeys,
    errors: params.errors,
    merge_logs: params.logs,
  };
}

async function rpcObject(sb: SupabaseAdmin, fn: string, args: Record<string, unknown>): Promise<RpcPayload> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);

  const obj = asObject(data);
  const errors = asStringArray(obj.errors);
  if (errors.length > 0 && obj.success === false) {
    throw new Error(errors.join("; "));
  }

  return obj;
}

export async function POST(req: Request) {
  const sessionId = randomUUID();
  let selectedProvider: GeoProvider = "geoapify";
  let selectedCountryCode: string | undefined;

  try {
    const payload = (await req.json()) as GeoMergeRequest;
    if (!isProvider(payload.provider)) {
      return NextResponse.json(failed("geoapify", sessionId, "provider must be geoapify or tomtom"), { status: 200 });
    }

    const provider = payload.provider;
    const countryCode = payload.countryCode?.trim() ? payload.countryCode.trim().toUpperCase() : undefined;
    selectedProvider = provider;
    selectedCountryCode = countryCode;
    const sb = getSupabaseAdmin();
    const logs: string[] = [];

    const reset = await rpcObject(sb, "reset_provider_pois_to_unified_merge", {
      p_provider: provider,
      p_country_code: countryCode ?? null,
      p_session_id: sessionId,
    });

    logs.push(...asStringArray(reset.merge_logs));

    const rawSourceCount = asNumber(reset.raw_source_count);
    const expectedCount = asNumber(reset.expected_count);
    const duplicateSourceKeys = asNumber(reset.duplicate_source_keys);
    let inserted = 0;
    let cursor: string | null = null;
    let hasMore = asBoolean(reset.has_more);

    for (let chunkNo = 1; hasMore && chunkNo <= MAX_CHUNKS; chunkNo++) {
      const chunk = await rpcObject(sb, "insert_provider_pois_to_unified_chunk", {
        p_provider: provider,
        p_country_code: countryCode ?? null,
        p_session_id: sessionId,
        p_after_source_id: cursor,
        p_limit: MERGE_CHUNK_SIZE,
      });

      const processed = asNumber(chunk.processed);
      const chunkInserted = asNumber(chunk.inserted);
      inserted += chunkInserted;
      cursor = asNullableString(chunk.next_cursor);
      hasMore = asBoolean(chunk.has_more);

      if (chunkNo <= 10 || !hasMore || chunkNo % 10 === 0) {
        logs.push(...asStringArray(chunk.merge_logs));
      }

      if (processed === 0) {
        logs.push(`Chunk ${chunkNo}: 0 processed rows, stopping to avoid an endless loop.`);
        break;
      }
    }

    if (hasMore) {
      const message = `Merge stopped after ${MAX_CHUNKS} chunks before reaching the end of the source cursor.`;
      return NextResponse.json(
        responseFrom({
          provider,
          countryCode,
          sessionId,
          status: "FAILED",
          rawSourceCount,
          expectedCount,
          foundCount: inserted,
          missingCount: Math.max(0, expectedCount - inserted),
          inserted,
          skipped: Math.max(0, rawSourceCount - expectedCount),
          duplicateSourceKeys,
          errors: [message],
          logs: [...logs, message],
        }),
        { status: 200 },
      );
    }

    const finish = await rpcObject(sb, "finish_provider_pois_to_unified_merge", {
      p_provider: provider,
      p_country_code: countryCode ?? null,
      p_session_id: sessionId,
    });

    logs.push(...asStringArray(finish.merge_logs));

    const foundCount = asNumber(finish.found_count);
    const missingCount = asNumber(finish.missing_count);
    const errors = asStringArray(finish.errors);
    const status: "SUCCESS" | "FAILED" = finish.status === "SUCCESS" && errors.length === 0 && missingCount === 0 ? "SUCCESS" : "FAILED";

    return NextResponse.json(
      responseFrom({
        provider,
        countryCode,
        sessionId,
        status,
        rawSourceCount: asNumber(finish.raw_source_count) || rawSourceCount,
        expectedCount: asNumber(finish.expected_count) || expectedCount,
        foundCount,
        missingCount,
        inserted,
        skipped: asNumber(finish.skipped) || Math.max(0, rawSourceCount - expectedCount),
        duplicateSourceKeys: asNumber(finish.duplicate_source_keys) || duplicateSourceKeys,
        errors,
        logs,
      }),
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      failed(selectedProvider, sessionId, err instanceof Error ? err.message : "Merge failed", selectedCountryCode),
      { status: 200 },
    );
  }
}
