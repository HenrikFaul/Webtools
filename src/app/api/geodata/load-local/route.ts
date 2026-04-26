import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  GeoLocalLoadProvider,
  GeoLocalLoadRequest,
  GeoLocalLoadResponse,
  GeoProvider,
} from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_RETRIES = 5;
const SOURCE_PAGE_SIZE = 1000;
const TARGET_PAGE_SIZE = 1000;
const MAX_BATCH_SIZE = 1000;
const MIN_BATCH_SIZE = 100;
const MAX_RETRY_LIMIT = 10;

interface UnifiedPoiRow {
  id?: string | number | null;
  source_provider?: string | null;
  source_id?: string | number | null;
  provider_id?: string | number | null;
  name?: string | null;
  name_international?: unknown;
  categories?: unknown;
  country?: string | null;
  country_code?: string | null;
  country_code_iso3?: string | null;
  iso3166_2?: string | null;
  state_region?: string | null;
  city?: string | null;
  district?: string | null;
  suburb?: string | null;
  postal_code?: string | null;
  street?: string | null;
  street_number?: string | null;
  formatted_address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  lat?: string | number | null;
  lon?: string | number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  tripadvisor?: string | null;
  opening_hours?: unknown;
  operator?: string | null;
  brand?: string | null;
  branch?: string | null;
  cuisine?: string | null;
  diet?: unknown;
  capacity?: string | number | null;
  reservation?: string | null;
  wheelchair?: string | null;
  outdoor_seating?: boolean | null;
  indoor_seating?: boolean | null;
  internet_access?: boolean | null;
  air_conditioning?: boolean | null;
  smoking?: string | null;
  toilets?: string | null;
  takeaway?: boolean | null;
  delivery?: boolean | null;
  payment_options?: unknown;
  classification_code?: string | null;
  osm_id?: string | number | null;
  building_type?: string | null;
  raw_data?: unknown;
  source_fetched_at?: string | null;
  unified_at?: string | null;
  [key: string]: unknown;
}

interface LocalPoiRow {
  provider_id: string;
  source_provider: GeoProvider;
  name: string | null;
  name_international: unknown;
  categories: unknown;
  country: string | null;
  country_code: string | null;
  country_code_iso3: string | null;
  iso3166_2: string | null;
  state_region: string | null;
  city: string | null;
  district: string | null;
  suburb: string | null;
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  formatted_address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  tripadvisor: string | null;
  opening_hours: unknown;
  operator: string | null;
  brand: string | null;
  branch: string | null;
  cuisine: string | null;
  diet: unknown;
  capacity: number | null;
  reservation: string | null;
  wheelchair: string | null;
  outdoor_seating: boolean | null;
  indoor_seating: boolean | null;
  internet_access: boolean | null;
  air_conditioning: boolean | null;
  smoking: string | null;
  toilets: string | null;
  takeaway: boolean | null;
  delivery: boolean | null;
  payment_options: unknown;
  classification_code: string | null;
  osm_id: number | null;
  building_type: string | null;
  raw_data: unknown;
  source_fetched_at: string | null;
  source_unified_at: string | null;
  last_load_session: string;
  last_loaded_at: string;
  updated_at: string;
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function providersFor(provider: GeoLocalLoadProvider): GeoProvider[] {
  return provider === "all" ? ["geoapify", "tomtom"] : [provider];
}

function isProvider(value: unknown): value is GeoLocalLoadProvider {
  return value === "geoapify" || value === "tomtom" || value === "all" || value == null;
}

function normalizeProvider(value: GeoLocalLoadProvider | undefined): GeoLocalLoadProvider {
  return value ?? "all";
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out.length > 0 ? out : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function stableJsonFallback(row: UnifiedPoiRow): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== "function") clone[key] = value;
  }
  return clone;
}

function rowProvider(row: UnifiedPoiRow): GeoProvider | null {
  if (row.source_provider === "geoapify" || row.source_provider === "tomtom") return row.source_provider;
  return null;
}

function keyFor(provider: GeoProvider, providerId: string): string {
  return `${provider}::${providerId}`;
}

function sourceKeyForRow(row: UnifiedPoiRow): string | null {
  const provider = rowProvider(row);
  const providerId = asString(row.source_id ?? row.provider_id);
  if (!provider || !providerId) return null;
  return keyFor(provider, providerId);
}

function toLocalPoi(row: UnifiedPoiRow, loadSessionId: string, nowIso: string): LocalPoiRow | null {
  const provider = rowProvider(row);
  const providerId = asString(row.source_id ?? row.provider_id);
  if (!provider || !providerId) return null;

  return {
    provider_id: providerId,
    source_provider: provider,
    name: asString(row.name),
    name_international: row.name_international ?? {},
    categories: row.categories ?? [],
    country: asString(row.country),
    country_code: asString(row.country_code),
    country_code_iso3: asString(row.country_code_iso3),
    iso3166_2: asString(row.iso3166_2),
    state_region: asString(row.state_region),
    city: asString(row.city),
    district: asString(row.district),
    suburb: asString(row.suburb),
    postal_code: asString(row.postal_code),
    street: asString(row.street),
    street_number: asString(row.street_number),
    formatted_address: asString(row.formatted_address),
    address_line1: asString(row.address_line1),
    address_line2: asString(row.address_line2),
    lat: asNumber(row.lat),
    lon: asNumber(row.lon),
    phone: asString(row.phone),
    email: asString(row.email),
    website: asString(row.website),
    facebook: asString(row.facebook),
    instagram: asString(row.instagram),
    tripadvisor: asString(row.tripadvisor),
    opening_hours: row.opening_hours ?? null,
    operator: asString(row.operator),
    brand: asString(row.brand),
    branch: asString(row.branch),
    cuisine: asString(row.cuisine),
    diet: row.diet ?? {},
    capacity: asNumber(row.capacity),
    reservation: asString(row.reservation),
    wheelchair: asString(row.wheelchair),
    outdoor_seating: row.outdoor_seating ?? null,
    indoor_seating: row.indoor_seating ?? null,
    internet_access: row.internet_access ?? null,
    air_conditioning: row.air_conditioning ?? null,
    smoking: asString(row.smoking),
    toilets: asString(row.toilets),
    takeaway: row.takeaway ?? null,
    delivery: row.delivery ?? null,
    payment_options: row.payment_options ?? {},
    classification_code: asString(row.classification_code),
    osm_id: asNumber(row.osm_id),
    building_type: asString(row.building_type),
    raw_data: row.raw_data ?? stableJsonFallback(row),
    source_fetched_at: asString(row.source_fetched_at),
    source_unified_at: asString(row.unified_at),
    last_load_session: loadSessionId,
    last_loaded_at: nowIso,
    updated_at: nowIso,
  };
}

async function countSourceRows(
  sb: SupabaseAdmin,
  providers: GeoProvider[],
  countryCode?: string,
): Promise<number> {
  let query = sb
    .from("unified_pois")
    .select("source_id", { count: "exact", head: true })
    .in("source_provider", providers)
    .not("source_id", "is", null);

  if (countryCode) query = query.eq("country_code", countryCode);

  const { error, count } = await query;
  if (error) throw new Error(`Source count failed: ${error.message}`);
  return count ?? 0;
}

async function fetchSourceRows(
  sb: SupabaseAdmin,
  providers: GeoProvider[],
  countryCode?: string,
): Promise<UnifiedPoiRow[]> {
  const rows: UnifiedPoiRow[] = [];
  let from = 0;

  while (true) {
    let query = sb
      .from("unified_pois")
      .select("*")
      .in("source_provider", providers)
      .not("source_id", "is", null)
      .range(from, from + SOURCE_PAGE_SIZE - 1)
      .order("source_provider", { ascending: true })
      .order("source_id", { ascending: true });

    if (countryCode) query = query.eq("country_code", countryCode);

    const { data, error } = await query;
    if (error) throw new Error(`Source page ${from}-${from + SOURCE_PAGE_SIZE - 1} failed: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as UnifiedPoiRow[]));
    if (data.length < SOURCE_PAGE_SIZE) break;
    from += SOURCE_PAGE_SIZE;
  }

  return rows;
}

function findDuplicateSourceKeys(rows: UnifiedPoiRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const key = sourceKeyForRow(row);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }

  return Array.from(duplicates);
}

function filterRowsByKeys(rows: UnifiedPoiRow[], keys: Set<string>): UnifiedPoiRow[] {
  return rows.filter((row) => {
    const key = sourceKeyForRow(row);
    return key ? keys.has(key) : false;
  });
}

async function upsertLocalRows(
  sb: SupabaseAdmin,
  rows: UnifiedPoiRow[],
  loadSessionId: string,
  batchSize: number,
  logs: string[],
): Promise<number> {
  let upserted = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < rows.length; i += batchSize) {
    const sourceChunk = rows.slice(i, i + batchSize);
    const chunk = sourceChunk
      .map((row) => toLocalPoi(row, loadSessionId, nowIso))
      .filter((row): row is LocalPoiRow => row !== null);

    if (chunk.length === 0) continue;

    const { error } = await sb
      .from("local_pois")
      .upsert(chunk, {
        onConflict: "provider_id,source_provider",
        ignoreDuplicates: false,
      });

    if (error) {
      const hint = error.message.includes("last_load_session")
        ? " Run supabase/migrations/20260426164500_local_pois_self_healing_etl.sql first, then retry."
        : "";
      throw new Error(`Local upsert failed at chunk ${i / batchSize + 1}: ${error.message}.${hint}`);
    }

    upserted += chunk.length;
    logs.push(`Upsert chunk ${Math.floor(i / batchSize) + 1}: ${chunk.length} records written/updated.`);
  }

  return upserted;
}

async function fetchTargetSessionKeys(
  sb: SupabaseAdmin,
  loadSessionId: string,
  providers: GeoProvider[],
): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("local_pois")
      .select("provider_id, source_provider")
      .eq("last_load_session", loadSessionId)
      .in("source_provider", providers)
      .range(from, from + TARGET_PAGE_SIZE - 1)
      .order("source_provider", { ascending: true })
      .order("provider_id", { ascending: true });

    if (error) throw new Error(`Target verification page ${from}-${from + TARGET_PAGE_SIZE - 1} failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{ provider_id: string | number | null; source_provider: string | null }>) {
      const provider = row.source_provider === "geoapify" || row.source_provider === "tomtom" ? row.source_provider : null;
      const providerId = asString(row.provider_id);
      if (provider && providerId) keys.add(keyFor(provider, providerId));
    }

    if (data.length < TARGET_PAGE_SIZE) break;
    from += TARGET_PAGE_SIZE;
  }

  return keys;
}

function buildResponse(params: {
  success: boolean;
  loadSessionId: string;
  provider: GeoLocalLoadProvider;
  countryCode?: string;
  expectedCount: number;
  foundCount: number;
  missingCount: number;
  attempts: number;
  upserted: number;
  logs: string[];
  errors: string[];
  duplicateSourceKeys: number;
  startedAt: number;
}): GeoLocalLoadResponse {
  return {
    status: params.success ? "SUCCESS" : "FAILED",
    success: params.success,
    load_session_id: params.loadSessionId,
    provider: params.provider,
    countryCode: params.countryCode,
    expected_count: params.expectedCount,
    found_count: params.foundCount,
    missing_count: params.missingCount,
    attempts: params.attempts,
    upserted: params.upserted,
    retry_logs: params.logs,
    errors: params.errors,
    duplicate_source_keys: params.duplicateSourceKeys,
    duration_ms: Date.now() - params.startedAt,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const loadSessionId = crypto.randomUUID();
  const logs: string[] = [];
  const errors: string[] = [];

  let provider: GeoLocalLoadProvider = "all";
  let countryCode: string | undefined;
  let attempts = 0;
  let upserted = 0;
  let expectedCount = 0;
  let foundCount = 0;
  let duplicateSourceKeys = 0;

  try {
    const payload = (await req.json()) as GeoLocalLoadRequest;
    if (!isProvider(payload.provider)) {
      return NextResponse.json({ error: "provider must be geoapify, tomtom, or all" }, { status: 400 });
    }

    provider = normalizeProvider(payload.provider);
    countryCode = payload.countryCode?.trim() || undefined;
    const providers = providersFor(provider);
    const maxRetries = clampInt(payload.maxRetries, DEFAULT_MAX_RETRIES, 1, MAX_RETRY_LIMIT);
    const batchSize = clampInt(payload.batchSize, DEFAULT_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    const sb = getSupabaseAdmin();

    logs.push(`Session ${loadSessionId} started for provider=${provider}${countryCode ? `, country=${countryCode}` : ""}.`);
    expectedCount = await countSourceRows(sb, providers, countryCode);

    if (expectedCount === 0) {
      logs.push("No source rows found in unified_pois for the selected filters. Nothing was written to local_pois.");
      const response = buildResponse({
        success: true,
        loadSessionId,
        provider,
        countryCode,
        expectedCount,
        foundCount: 0,
        missingCount: 0,
        attempts: 0,
        upserted: 0,
        logs,
        errors,
        duplicateSourceKeys: 0,
        startedAt,
      });
      return NextResponse.json(response);
    }

    const sourceRows = await fetchSourceRows(sb, providers, countryCode);
    const duplicates = findDuplicateSourceKeys(sourceRows);
    duplicateSourceKeys = duplicates.length;

    if (duplicateSourceKeys > 0) {
      errors.push(`Duplicate source keys detected in unified_pois: ${duplicateSourceKeys}. Example(s): ${duplicates.slice(0, 5).join(", ")}. With ON CONFLICT(provider_id, source_provider), exact count equality is impossible until the source is deduplicated.`);
      const response = buildResponse({
        success: false,
        loadSessionId,
        provider,
        countryCode,
        expectedCount,
        foundCount: 0,
        missingCount: expectedCount,
        attempts: 0,
        upserted: 0,
        logs,
        errors,
        duplicateSourceKeys,
        startedAt,
      });
      return NextResponse.json(response, { status: 409 });
    }

    let candidateRows = sourceRows;
    let missingCount = expectedCount;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attempts = attempt;
      logs.push(`Attempt ${attempt}/${maxRetries}: upserting ${candidateRows.length} candidate record(s) to local_pois.`);
      upserted += await upsertLocalRows(sb, candidateRows, loadSessionId, batchSize, logs);

      const foundKeys = await fetchTargetSessionKeys(sb, loadSessionId, providers);
      foundCount = foundKeys.size;
      missingCount = Math.max(0, expectedCount - foundCount);
      logs.push(`Verification ${attempt}/${maxRetries}: Expected: ${expectedCount}, Found: ${foundCount}, Missing: ${missingCount}.`);

      if (foundCount === expectedCount) {
        logs.push("SUCCESS: target last_load_session count equals source expected count exactly.");
        const response = buildResponse({
          success: true,
          loadSessionId,
          provider,
          countryCode,
          expectedCount,
          foundCount,
          missingCount: 0,
          attempts,
          upserted,
          logs,
          errors,
          duplicateSourceKeys,
          startedAt,
        });
        return NextResponse.json(response);
      }

      const foundKeySet = foundKeys;
      const missingKeys = new Set<string>();
      for (const row of sourceRows) {
        const key = sourceKeyForRow(row);
        if (key && !foundKeySet.has(key)) missingKeys.add(key);
      }

      if (missingKeys.size === 0) {
        errors.push(`Verification mismatch but no missing source keys could be identified. Expected: ${expectedCount}, Found: ${foundCount}.`);
        break;
      }

      candidateRows = filterRowsByKeys(sourceRows, missingKeys);
      logs.push(`Expected: ${expectedCount}, Found: ${foundCount} - Retrying missing ${candidateRows.length} record(s).`);
    }

    errors.push(`FAILED: local_pois did not reach exact parity after ${attempts} attempt(s). Expected: ${expectedCount}, Found: ${foundCount}, Missing: ${Math.max(0, expectedCount - foundCount)}.`);
    const response = buildResponse({
      success: false,
      loadSessionId,
      provider,
      countryCode,
      expectedCount,
      foundCount,
      missingCount: Math.max(0, expectedCount - foundCount),
      attempts,
      upserted,
      logs,
      errors,
      duplicateSourceKeys,
      startedAt,
    });
    return NextResponse.json(response, { status: 409 });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Unknown local ETL failure");
    const response = buildResponse({
      success: false,
      loadSessionId,
      provider,
      countryCode,
      expectedCount,
      foundCount,
      missingCount: Math.max(0, expectedCount - foundCount),
      attempts,
      upserted,
      logs,
      errors,
      duplicateSourceKeys,
      startedAt,
    });
    return NextResponse.json(response, { status: 500 });
  }
}
