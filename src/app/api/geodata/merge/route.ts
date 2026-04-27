import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse, GeoProvider } from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DELETE_BATCH = 500;
const READ_PAGE = 1000;
const INSERT_BATCH = 500;

type Sb = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, unknown>;

function isProvider(v: unknown): v is GeoProvider {
  return v === "geoapify" || v === "tomtom";
}

function asStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v == null) return null;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return null;
}

function toJsonb(v: unknown, fallback: unknown): unknown {
  if (v == null || v === "") return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}

function failed(
  provider: GeoProvider,
  sessionId: string,
  msg: string,
  countryCode?: string,
): GeoMergeResponse {
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
    errors: [msg],
    merge_logs: [],
  };
}

// ---- Delete existing rows in small batches to avoid statement timeout ----

async function deleteExisting(
  sb: Sb,
  provider: GeoProvider,
  countryCode: string | undefined,
  logs: string[],
): Promise<number> {
  let deleted = 0;

  while (true) {
    let q = sb
      .from("unified_pois")
      .select("id")
      .eq("source_provider", provider)
      .limit(DELETE_BATCH);
    if (countryCode) q = q.eq("country_code", countryCode);

    const { data, error } = await q;
    if (error) throw new Error(`Delete-select failed: ${error.message}`);
    if (!data?.length) break;

    const ids = (data as Row[]).map((r) => r.id as string);
    const { error: delErr } = await sb.from("unified_pois").delete().in("id", ids);
    if (delErr) throw new Error(`Delete-batch failed: ${delErr.message}`);

    deleted += ids.length;
    if (ids.length < DELETE_BATCH) break;
  }

  logs.push(
    `Deleted ${deleted} existing unified_pois rows for provider=${provider}${countryCode ? `, country=${countryCode}` : ", country=ALL"}.`,
  );
  return deleted;
}

// ---- Field transformers ----

function transformGeoapify(row: Row, sessionId: string, now: string): Row {
  return {
    source_provider: "geoapify",
    source_id: asStr(row.external_id),
    name: asStr(row.name),
    name_international: toJsonb(row.name_international, {}),
    categories: toJsonb(row.categories, []),
    country: asStr(row.country),
    country_code: asStr(row.country_code)?.toUpperCase() ?? null,
    country_code_iso3: null,
    iso3166_2: asStr(row.iso3166_2),
    state_region: asStr(row.state),
    city: asStr(row.city),
    district: asStr(row.district),
    suburb: asStr(row.suburb),
    postal_code: asStr(row.postcode),
    street: asStr(row.street),
    street_number: asStr(row.housenumber),
    formatted_address: asStr(row.formatted_address),
    address_line1: asStr(row.address_line1),
    address_line2: asStr(row.address_line2),
    lat: asNum(row.lat),
    lon: asNum(row.lon),
    phone: asStr(row.phone),
    email: asStr(row.email),
    website: asStr(row.website),
    facebook: asStr(row.facebook),
    instagram: asStr(row.instagram),
    tripadvisor: asStr(row.tripadvisor),
    opening_hours: toJsonb(row.opening_hours, null),
    operator: asStr(row.operator),
    brand: asStr(row.brand),
    branch: asStr(row.branch),
    cuisine: asStr(row.cuisine),
    diet: toJsonb(row.diet, {}),
    capacity: asNum(row.capacity),
    reservation: asStr(row.reservation),
    wheelchair: asStr(row.wheelchair),
    outdoor_seating: toBool(row.outdoor_seating),
    indoor_seating: toBool(row.indoor_seating),
    internet_access: toBool(row.internet_access),
    air_conditioning: toBool(row.air_conditioning),
    smoking: asStr(row.smoking),
    toilets: asStr(row.toilets),
    takeaway: toBool(row.takeaway),
    delivery: toBool(row.delivery),
    payment_options: toJsonb(row.payment_options, {}),
    classification_code: null,
    osm_id: asNum(row.osm_id),
    building_type: asStr(row.building_type),
    raw_data: toJsonb(row.raw_data, {}),
    source_fetched_at: asStr(row.fetched_at),
    unified_at: now,
    last_merge_session: sessionId,
    last_merged_at: now,
    created_at: now,
    updated_at: now,
  };
}

function transformTomtom(row: Row, sessionId: string, now: string): Row {
  const clsArr = Array.isArray(row.classifications)
    ? (row.classifications as Row[])
    : [];
  const catArr = Array.isArray(row.category_set)
    ? (row.category_set as Row[])
    : [];
  const classificationCode =
    asStr(clsArr[0]?.code) ?? asStr(catArr[0]?.id) ?? null;

  return {
    source_provider: "tomtom",
    source_id: asStr(row.external_id),
    name: asStr(row.name),
    name_international: {},
    categories: toJsonb(row.categories, []),
    country: asStr(row.country),
    country_code: asStr(row.country_code)?.toUpperCase() ?? null,
    country_code_iso3: asStr(row.country_code_iso3),
    iso3166_2: null,
    state_region: asStr(row.country_subdivision_name) ?? asStr(row.country_subdivision),
    city: asStr(row.municipality),
    district: asStr(row.municipality_subdivision),
    suburb: asStr(row.municipality_secondary_subdivision),
    postal_code: asStr(row.postal_code),
    street: asStr(row.street_name),
    street_number: asStr(row.street_number),
    formatted_address: asStr(row.freeform_address),
    address_line1: asStr(row.name),
    address_line2: asStr(row.freeform_address),
    lat: asNum(row.lat),
    lon: asNum(row.lon),
    phone: asStr(row.phone),
    email: null,
    website: asStr(row.url),
    facebook: null,
    instagram: null,
    tripadvisor: null,
    opening_hours: toJsonb(row.opening_hours, null),
    operator: null,
    brand: null,
    branch: null,
    cuisine: null,
    diet: {},
    capacity: null,
    reservation: null,
    wheelchair: null,
    outdoor_seating: null,
    indoor_seating: null,
    internet_access: null,
    air_conditioning: null,
    smoking: null,
    toilets: null,
    takeaway: null,
    delivery: null,
    payment_options: {},
    classification_code: classificationCode,
    osm_id: null,
    building_type: null,
    raw_data: toJsonb(row.raw_data, {}),
    source_fetched_at: asStr(row.fetched_at),
    unified_at: now,
    last_merge_session: sessionId,
    last_merged_at: now,
    created_at: now,
    updated_at: now,
  };
}

// ---- Stream source rows, deduplicate by external_id, insert in batches ----

interface StreamResult {
  inserted: number;
  rawSourceCount: number;
  expectedCount: number;
  duplicateSourceKeys: number;
}

async function streamAndInsert(
  sb: Sb,
  provider: GeoProvider,
  sessionId: string,
  now: string,
  countryCode: string | undefined,
  logs: string[],
): Promise<StreamResult> {
  const sourceTable = provider === "geoapify" ? "geoapify_pois" : "tomtom_pois";
  const seen = new Set<string>();
  let from = 0;
  let inserted = 0;
  let rawSourceCount = 0;
  let duplicateSourceKeys = 0;
  let chunkNo = 0;
  let pending: Row[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const { error } = await sb.from("unified_pois").insert(pending);
    if (error) throw new Error(`Insert chunk ${chunkNo + 1} failed: ${error.message}`);
    inserted += pending.length;
    chunkNo++;
    logs.push(`Chunk ${chunkNo}: inserted ${pending.length} rows (cumulative: ${inserted}).`);
    pending = [];
  };

  while (true) {
    let q = sb
      .from(sourceTable)
      .select("*")
      .not("external_id", "is", null)
      .range(from, from + READ_PAGE - 1)
      .order("external_id", { ascending: true })
      .order("fetched_at", { ascending: false });

    if (countryCode) q = q.eq("country_code", countryCode);

    const { data, error } = await q;
    if (error) throw new Error(`Source read [${from}-${from + READ_PAGE - 1}] failed: ${error.message}`);
    if (!data?.length) break;

    rawSourceCount += data.length;

    for (const row of data as Row[]) {
      const extId = asStr(row.external_id);
      if (!extId) continue;

      if (seen.has(extId)) {
        duplicateSourceKeys++;
        continue;
      }
      seen.add(extId);

      const unified =
        provider === "geoapify"
          ? transformGeoapify(row, sessionId, now)
          : transformTomtom(row, sessionId, now);

      if (!unified.source_id) continue;
      pending.push(unified);

      if (pending.length >= INSERT_BATCH) {
        await flush();
      }
    }

    if (data.length < READ_PAGE) break;
    from += READ_PAGE;
  }

  await flush();

  return {
    inserted,
    rawSourceCount,
    expectedCount: seen.size,
    duplicateSourceKeys,
  };
}

// ---- Verify final count in unified_pois for this session ----

async function verifyCount(
  sb: Sb,
  provider: GeoProvider,
  sessionId: string,
  countryCode: string | undefined,
): Promise<number> {
  let q = sb
    .from("unified_pois")
    .select("source_id", { count: "exact", head: true })
    .eq("source_provider", provider)
    .eq("last_merge_session", sessionId);

  if (countryCode) q = q.eq("country_code", countryCode);

  const { count, error } = await q;
  if (error) throw new Error(`Verification count failed: ${error.message}`);
  return count ?? 0;
}

// ---- Handler ----

export async function POST(req: Request) {
  const sessionId = randomUUID();
  let selectedProvider: GeoProvider = "geoapify";
  let selectedCountryCode: string | undefined;

  try {
    const payload = (await req.json()) as GeoMergeRequest;
    if (!isProvider(payload.provider)) {
      return NextResponse.json(
        failed("geoapify", sessionId, "provider must be geoapify or tomtom"),
        { status: 200 },
      );
    }

    const provider = payload.provider;
    const countryCode =
      payload.countryCode?.trim() ? payload.countryCode.trim().toUpperCase() : undefined;
    selectedProvider = provider;
    selectedCountryCode = countryCode;

    const sb = getSupabaseAdmin();
    const logs: string[] = [];
    const now = new Date().toISOString();

    logs.push(
      `Session ${sessionId} started — provider=${provider}, country=${countryCode ?? "ALL"}.`,
    );

    // Phase 1: Remove old rows in small DELETE batches (avoids statement timeout)
    await deleteExisting(sb, provider, countryCode, logs);

    // Phase 2: Read source, deduplicate in JS, insert in batches
    const { inserted, rawSourceCount, expectedCount, duplicateSourceKeys } =
      await streamAndInsert(sb, provider, sessionId, now, countryCode, logs);

    if (expectedCount === 0) {
      logs.push("No source rows found — nothing inserted.");
      return NextResponse.json(
        {
          status: "SUCCESS",
          success: true,
          provider,
          countryCode: countryCode ?? null,
          merge_session_id: sessionId,
          raw_source_count: rawSourceCount,
          expected_count: 0,
          found_count: 0,
          missing_count: 0,
          inserted: 0,
          updated: 0,
          skipped: duplicateSourceKeys,
          duplicate_source_keys: duplicateSourceKeys,
          errors: [],
          merge_logs: logs,
        } as GeoMergeResponse,
        { status: 200 },
      );
    }

    // Phase 3: Verify
    const foundCount = await verifyCount(sb, provider, sessionId, countryCode);
    const missingCount = Math.max(0, expectedCount - foundCount);
    const success = missingCount === 0;

    logs.push(
      `Verification: expected=${expectedCount}, found=${foundCount}, missing=${missingCount} — ${success ? "SUCCESS" : "FAILED"}.`,
    );

    return NextResponse.json(
      {
        status: success ? "SUCCESS" : "FAILED",
        success,
        provider,
        countryCode: countryCode ?? null,
        merge_session_id: sessionId,
        raw_source_count: rawSourceCount,
        expected_count: expectedCount,
        found_count: foundCount,
        missing_count: missingCount,
        inserted,
        updated: 0,
        skipped: duplicateSourceKeys,
        duplicate_source_keys: duplicateSourceKeys,
        errors: success
          ? []
          : [
              `Post-merge validation failed: expected ${expectedCount}, found ${foundCount}, missing ${missingCount}`,
            ],
        merge_logs: logs,
      } as GeoMergeResponse,
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      failed(
        selectedProvider,
        sessionId,
        err instanceof Error ? err.message : "Merge failed",
        selectedCountryCode,
      ),
      { status: 200 },
    );
  }
}
