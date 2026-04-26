import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest } from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RpcMergeResult = {
  status?: "SUCCESS" | "FAILED";
  success?: boolean;
  provider?: string;
  countryCode?: string | null;
  merge_session_id?: string;
  raw_source_count?: number;
  expected_count?: number;
  found_count?: number;
  missing_count?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  logs?: string[];
  duration_ms?: number;
};

function normalizeErrors(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function normalizeLogs(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function fail(message: string, status = 500) {
  return NextResponse.json(
    {
      status: "FAILED",
      success: false,
      inserted: 0,
      updated: 0,
      skipped: 0,
      raw_source_count: 0,
      expected_count: 0,
      found_count: 0,
      missing_count: 0,
      merge_session_id: "n/a",
      errors: [message],
      logs: [],
    },
    { status },
  );
}

export async function POST(req: Request) {
  let payload: GeoMergeRequest;

  try {
    payload = (await req.json()) as GeoMergeRequest;
  } catch {
    return fail("Invalid JSON request body", 400);
  }

  if (payload.provider !== "geoapify" && payload.provider !== "tomtom") {
    return fail("provider must be geoapify or tomtom", 400);
  }

  const mergeSessionId = randomUUID();

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc("merge_provider_pois_to_unified", {
      p_provider: payload.provider,
      p_country_code: payload.countryCode || null,
      p_session: mergeSessionId,
    });

    if (error) {
      return fail(`Database-side merge failed: ${error.message}`);
    }

    const result = (data ?? {}) as RpcMergeResult;
    const errors = normalizeErrors(result.errors);
    const logs = normalizeLogs(result.logs);
    const success = result.success === true || result.status === "SUCCESS";

    return NextResponse.json({
      status: success ? "SUCCESS" : "FAILED",
      success,
      provider: result.provider ?? payload.provider,
      countryCode: result.countryCode ?? payload.countryCode ?? null,
      merge_session_id: result.merge_session_id ?? mergeSessionId,
      raw_source_count: Number(result.raw_source_count ?? 0),
      expected_count: Number(result.expected_count ?? 0),
      found_count: Number(result.found_count ?? 0),
      missing_count: Number(result.missing_count ?? 0),
      inserted: Number(result.inserted ?? 0),
      updated: Number(result.updated ?? 0),
      skipped: Number(result.skipped ?? 0),
      errors,
      logs,
      duration_ms: Number(result.duration_ms ?? 0),
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Merge failed");
  }
}
