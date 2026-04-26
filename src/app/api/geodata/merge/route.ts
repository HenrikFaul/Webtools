import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse, GeoProvider } from "@/types/geodata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 1000;
const MIN_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 5000;
const DEFAULT_MAX_RETRIES = 5;
const MAX_RETRY_LIMIT = 10;
const TARGET_PAGE_SIZE = 1000;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type SourceRow = Record<string, unknown>;
type UnifiedRow = Record<string, unknown> & {
  source_provider: GeoProvider;
  source_id: string;
  last_merge_session: string;
  last_merged_at: string;
};

interface MergeStats {
  inserted: number;
  updated: number;
  skipped: number;
  processed: number;
  upserted: number;
  failed: number;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

function firstNonNull(...vals: unknown[]): string | null {
  for (const value of vals) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function valueOr<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

function providerSourceKey(provider: GeoProvider, sourceId: string): string {
  return `${provider}::${sourceId}`;
}

function sourceTable(provider: GeoProvider): "geoapify_pois" | "tomtom_pois" {
  return provider === "geoapify" ? "geoapify_pois" : "tomtom_pois";
}

function duplicateMessage(provider: GeoProvider, count: number, examples: string[]): string {
  return `Duplicate ${provider} source keys detected while merging: ${count}. ` +
    `Target parity is verified against distinct source ids, not duplicate raw rows. Example(s): ${examples.join(", ")}.`;
}

function mapGeoapifyRow(r: SourceRow, loadSessionId: string, nowIso: string): UnifiedRow | null {
  const sourceId = asString(r.external_id ?? r.id);
  if (!sourceId) return null;

  return {
    source_provider: "geoapify",
    source_id: sourceId,
    name: asString(r.name),
    name_international: valueOr(r.name_international, {}),
    categories: valueOr(r.categories, []),
    country: asString(r.country),
    country_code: asString(r.country_code),
    country_code_iso3: null,
    iso3166_2: asString(r.iso3166_2),
    state_region: asString(r.state),
    city: asString(r.city),
    district: asString(r.district),
    suburb: asString(r.suburb),
    postal_code: asString(r.postcode),
    street: asString(r.street),
    street_number: asString(r.housenumber),
    formatted_address: asString(r.formatted_address),
    address_line1: asString(r.address_line1),
    address_line2: asString(r.address_line2),
    lat: asNumber(r.lat),
    lon: asNumber(r.lon),
    phone: asString(r.phone),
    email: asString(r.email),
    website: asString(r.website),
    facebook: asString(r.facebook),
    instagram: asString(r.instagram),
    tripadvisor: asString(r.tripadvisor),
    opening_hours: valueOr(r.opening_hours, null),
    operator: asString(r.operator),
    brand: asString(r.brand),
    branch: asString(r.branch),
    cuisine: asString(r.cuisine),
    diet: valueOr(r.diet, {}),
    capacity: asNumber(r.capacity),
    reservation: asString(r.reservation),
    wheelchair: asString(r.wheelchair),
    outdoor_seating: asBoolean(r.outdoor_seating),
    indoor_seating: asBoolean(r.indoor_seating),
    internet_access: asBoolean(r.internet_access),
    air_conditioning: asBoolean(r.air_conditioning),
    smoking: asString(r.smoking),
    toilets: asString(r.toilets),
    takeaway: asBoolean(r.takeaway),
    delivery: asBoolean(r.delivery),
    payment_options: valueOr(r.payment_options, {}),
    classification_code: null,
    osm_id: asNumber(r.osm_id),
    building_type: asString(r.building_type),
    raw_data: valueOr(r.raw_data, r),
    source_fetched_at: asString(r.fetched_at),
    unified_at: nowIso,
    last_merge_session: loadSessionId,
    last_merged_at: nowIso,
  };
}

function mapTomTomRow(r: SourceRow, loadSessionId: string, nowIso: string): UnifiedRow | null {
  const sourceId = asString(r.external_id ?? r.id);
  if (!sourceId) return null;

  const classifications = Array.isArray(r.classifications) ? r.classifications as Array<Record<string, unknown>> : [];

  return {
    source_provider: "tomtom",
    source_id: sourceId,
    name: asString(r.name),
    name_international: {},
    categories: valueOr(r.categories, []),
    country: asString(r.country),
    country_code: asString(r.country_code),
    country_code_iso3: asString(r.country_code_iso3),
    iso3166_2: null,
    state_region: firstNonNull(r.country_subdivision_name, r.country_subdivision),
    city: firstNonNull(r.municipality),
    district: asString(r.municipality_subdivision),
    suburb: asString(r.municipality_secondary_subdivision),
    postal_code: asString(r.postal_code),
    street: asString(r.street_name),
    street_number: asString(r.street_number),
    formatted_address: asString(r.freeform_address),
    address_line1: asString(r.name),
    address_line2: asString(r.freeform_address),
    lat: asNumber(r.lat),
    lon: asNumber(r.lon),
    phone: asString(r.phone),
    email: null,
    website: asString(r.url),
    facebook: null,
    instagram: null,
    tripadvisor: null,
    opening_hours: valueOr(r.opening_hours, null),
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
    classification_code: asString(classifications[0]?.code),
    osm_id: null,
    building_type: null,
    raw_data: valueOr(r.raw_data, r),
    source_fetched_at: asString(r.fetched_at),
    unified_at: nowIso,
    last_merge_session: loadSessionId,
    last_merged_at: nowIso,
  };
}

function mapSourceRow(provider: GeoProvider, row: SourceRow, loadSessionId: string, nowIso: string): UnifiedRow | null {
  return provider === "geoapify"
    ? mapGeoapifyRow(row, loadSessionId, nowIso)
    : mapTomTomRow(row, loadSessionId, nowIso);
}

async function countRawSourceRows(sb: SupabaseAdmin, provider: GeoProvider, countryCode?: string): Promise<number> {
  let query = sb
    .from(sourceTable(provider))
    .select("external_id", { count: "exact", head: true })
    .not("external_id", "is", null);

  if (countryCode) query = query.eq("country_code", countryCode);

  const { count, error } = await query;
  if (error) throw new Error(`Raw source count failed for ${provider}: ${error.message}`);
  return count ?? 0;
}

async function fetchExistingUnifiedKeys(
  sb: SupabaseAdmin,
  provider: GeoProvider,
  sourceIds: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  if (sourceIds.length === 0) return existing;

  const { data, error } = await sb
    .from("unified_pois")
    .select("source_id")
    .eq("source_provider", provider)
    .in("source_id", sourceIds);

  if (error) throw new Error(`Existing unified key lookup failed: ${error.message}`);
  for (const row of (data ?? []) as Array<{ source_id?: string | number | null }>) {
    const key = asString(row.source_id);
    if (key) existing.add(key);
  }
  return existing;
}

async function recordDeadLetter(
  sb: SupabaseAdmin,
  jobId: string,
  provider: GeoProvider,
  sourceId: string | null,
  phase: string,
  message: string,
  rawData?: unknown,
): Promise<void> {
  await sb.from("poi_etl_errors").insert({
    job_id: jobId,
    provider,
    source_id: sourceId,
    phase,
    error_message: message,
    raw_data: rawData ?? null,
  });
}

async function upsertUnifiedChunk(
  sb: SupabaseAdmin,
  provider: GeoProvider,
  rows: UnifiedRow[],
  jobId: string,
  logs: string[],
  errors: string[],
): Promise<MergeStats> {
  const stats: MergeStats = { inserted: 0, updated: 0, skipped: 0, processed: 0, upserted: 0, failed: 0 };
  if (rows.length === 0) return stats;

  const bySourceId = new Map<string, UnifiedRow>();
  for (const row of rows) {
    if (bySourceId.has(row.source_id)) stats.skipped++;
    bySourceId.set(row.source_id, row);
  }
  const deduped = Array.from(bySourceId.values());
  const keys = deduped.map((row) => row.source_id);
  const existing = await fetchExistingUnifiedKeys(sb, provider, keys);

  try {
    const { error } = await sb
      .from("unified_pois")
      .upsert(deduped, {
        onConflict: "source_provider,source_id",
        ignoreDuplicates: false,
      });

    if (error) throw error;

    for (const key of keys) {
      if (existing.has(key)) stats.updated++;
      else stats.inserted++;
    }
    stats.processed += rows.length;
    stats.upserted += deduped.length;
    return stats;
  } catch (err) {
    const bulkMessage = err instanceof Error ? err.message : String(err);
    const hint = bulkMessage.includes("last_merge_session")
      ? " Run supabase/migrations/20260426164500_local_pois_self_healing_etl.sql before retrying."
      : "";
    errors.push(`Bulk upsert failed for ${provider}; falling back to row-level salvage. ${bulkMessage}.${hint}`);

    for (const row of deduped) {
      try {
        const { error } = await sb
          .from("unified_pois")
          .upsert(row, {
            onConflict: "source_provider,source_id",
            ignoreDuplicates: false,
          });

        if (error) throw error;
        if (existing.has(row.source_id)) stats.updated++;
        else stats.inserted++;
        stats.upserted++;
      } catch (rowErr) {
        const rowMessage = rowErr instanceof Error ? rowErr.message : String(rowErr);
        stats.failed++;
        errors.push(`Failed ${provider}/${row.source_id}: ${rowMessage}`);
        await recordDeadLetter(sb, jobId, provider, row.source_id, "merge-upsert", rowMessage, row.raw_data);
      }
    }
    stats.processed += rows.length;
    logs.push(`Chunk salvage completed for ${provider}: ${stats.upserted} upserted, ${stats.failed} failed.`);
    return stats;
  }
}

async function fetchTargetSessionKeys(
  sb: SupabaseAdmin,
  provider: GeoProvider,
  loadSessionId: string,
  countryCode?: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0;

  while (true) {
    let query = sb
      .from("unified_pois")
      .select("source_id")
      .eq("source_provider", provider)
      .eq("last_merge_session", loadSessionId)
      .range(from, from + TARGET_PAGE_SIZE - 1)
      .order("source_id", { ascending: true });

    if (countryCode) query = query.eq("country_code", countryCode);

    const { data, error } = await query;
    if (error) throw new Error(`Target verification page ${from}-${from + TARGET_PAGE_SIZE - 1} failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{ source_id?: string | number | null }>) {
      const sourceId = asString(row.source_id);
      if (sourceId) keys.add(providerSourceKey(provider, sourceId));
    }

    if (data.length < TARGET_PAGE_SIZE) break;
    from += TARGET_PAGE_SIZE;
  }

  return keys;
}

async function fetchSourceRowsByIds(
  sb: SupabaseAdmin,
  provider: GeoProvider,
  sourceIds: string[],
  countryCode?: string,
): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  for (let i = 0; i < sourceIds.length; i += DEFAULT_BATCH_SIZE) {
    const ids = sourceIds.slice(i, i + DEFAULT_BATCH_SIZE);
    let query = sb
      .from(sourceTable(provider))
      .select("*")
      .in("external_id", ids);

    if (countryCode) query = query.eq("country_code", countryCode);

    const { data, error } = await query;
    if (error) throw new Error(`Retry source lookup failed for ${provider}: ${error.message}`);
    rows.push(...((data ?? []) as SourceRow[]));
  }
  return rows;
}

async function runMergeForProvider(
  sb: SupabaseAdmin,
  provider: GeoProvider,
  countryCode: string | undefined,
  batchSize: number,
  maxRetries: number,
  loadSessionId: string,
  logs: string[],
  errors: string[],
): Promise<{
  rawSourceCount: number;
  expectedDistinctCount: number;
  foundCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  upserted: number;
  failed: number;
  duplicateSourceKeys: number;
  attempts: number;
}> {
  const rawSourceCount = await countRawSourceRows(sb, provider, countryCode);
  const sourceKeys = new Set<string>();
  const duplicateExamples: string[] = [];
  let duplicateSourceKeys = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let upserted = 0;
  let failed = 0;
  let from = 0;
  let page = 0;
  const nowIso = new Date().toISOString();

  logs.push(`Merge session ${loadSessionId} started for ${provider}${countryCode ? `, country=${countryCode}` : ""}. Raw source count: ${rawSourceCount}.`);

  while (true) {
    let query = sb
      .from(sourceTable(provider))
      .select("*")
      .not("external_id", "is", null)
      .range(from, from + batchSize - 1)
      .order("external_id", { ascending: true });

    if (countryCode) query = query.eq("country_code", countryCode);

    const { data, error } = await query;
    if (error) throw new Error(`Source page ${from}-${from + batchSize - 1} failed for ${provider}: ${error.message}`);
    if (!data || data.length === 0) break;

    page++;
    const mappedRows: UnifiedRow[] = [];
    for (const raw of data as SourceRow[]) {
      const unified = mapSourceRow(provider, raw, loadSessionId, nowIso);
      if (!unified) {
        skipped++;
        await recordDeadLetter(sb, loadSessionId, provider, null, "merge-map", "Missing usable source id", raw);
        continue;
      }
      const key = providerSourceKey(provider, unified.source_id);
      if (sourceKeys.has(key)) {
        duplicateSourceKeys++;
        if (duplicateExamples.length < 5) duplicateExamples.push(key);
      }
      sourceKeys.add(key);
      mappedRows.push(unified);
    }

    const stats = await upsertUnifiedChunk(sb, provider, mappedRows, loadSessionId, logs, errors);
    inserted += stats.inserted;
    updated += stats.updated;
    skipped += stats.skipped;
    upserted += stats.upserted;
    failed += stats.failed;
    logs.push(`Merge chunk ${page}: ${mappedRows.length} mapped, ${stats.upserted} upserted, ${stats.inserted} inserted, ${stats.updated} updated, ${stats.failed} failed.`);

    if (data.length < batchSize) break;
    from += batchSize;
  }

  if (duplicateSourceKeys > 0) {
    logs.push(duplicateMessage(provider, duplicateSourceKeys, duplicateExamples));
  }

  let foundKeys = await fetchTargetSessionKeys(sb, provider, loadSessionId, countryCode);
  let foundCount = foundKeys.size;
  let attempts = 1;
  logs.push(`Merge verification 1/${maxRetries}: Expected distinct: ${sourceKeys.size}, Found in unified_pois for this session: ${foundCount}, Missing: ${Math.max(0, sourceKeys.size - foundCount)}.`);

  while (foundCount !== sourceKeys.size && attempts < maxRetries) {
    attempts++;
    const missingIds: string[] = [];
    for (const key of sourceKeys) {
      if (!foundKeys.has(key)) missingIds.push(key.split("::").slice(1).join("::"));
    }

    if (missingIds.length === 0) break;
    logs.push(`Expected: ${sourceKeys.size}, Found: ${foundCount} - Retrying missing ${missingIds.length} ${provider} record(s).`);

    const retryRows = await fetchSourceRowsByIds(sb, provider, missingIds, countryCode);
    const mappedRetryRows = retryRows
      .map((row) => mapSourceRow(provider, row, loadSessionId, new Date().toISOString()))
      .filter((row): row is UnifiedRow => row !== null);
    const stats = await upsertUnifiedChunk(sb, provider, mappedRetryRows, loadSessionId, logs, errors);
    inserted += stats.inserted;
    updated += stats.updated;
    skipped += stats.skipped;
    upserted += stats.upserted;
    failed += stats.failed;

    foundKeys = await fetchTargetSessionKeys(sb, provider, loadSessionId, countryCode);
    foundCount = foundKeys.size;
    logs.push(`Merge verification ${attempts}/${maxRetries}: Expected distinct: ${sourceKeys.size}, Found: ${foundCount}, Missing: ${Math.max(0, sourceKeys.size - foundCount)}.`);
  }

  return {
    rawSourceCount,
    expectedDistinctCount: sourceKeys.size,
    foundCount,
    inserted,
    updated,
    skipped,
    upserted,
    failed,
    duplicateSourceKeys,
    attempts,
  };
}

function normalizeProviders(provider: GeoProvider | "all"): GeoProvider[] {
  return provider === "all" ? ["geoapify", "tomtom"] : [provider];
}

export async function POST(req: Request) {
  const loadSessionId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const payload = (await req.json()) as GeoMergeRequest & {
      provider?: GeoProvider | "all";
      batchSize?: number;
      maxRetries?: number;
    };

    if (!payload.provider) return NextResponse.json({ error: "provider is required" }, { status: 400 });
    if (!["geoapify", "tomtom", "all"].includes(payload.provider)) {
      return NextResponse.json({ error: "provider must be geoapify, tomtom, or all" }, { status: 400 });
    }

    const providers = normalizeProviders(payload.provider);
    const countryCode = payload.countryCode?.trim() || undefined;
    const batchSize = clampInt(payload.batchSize, DEFAULT_BATCH_SIZE, MIN_BATCH_SIZE, MAX_BATCH_SIZE);
    const maxRetries = clampInt(payload.maxRetries, DEFAULT_MAX_RETRIES, 1, MAX_RETRY_LIMIT);
    const sb = getSupabaseAdmin();
    const logs: string[] = [];
    const errors: string[] = [];

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let raw_source_count = 0;
    let expected_count = 0;
    let found_count = 0;
    let upserted = 0;
    let failed = 0;
    let duplicate_source_keys = 0;
    let attempts = 0;

    for (const provider of providers) {
      const result = await runMergeForProvider(
        sb,
        provider,
        countryCode,
        batchSize,
        maxRetries,
        loadSessionId,
        logs,
        errors,
      );
      inserted += result.inserted;
      updated += result.updated;
      skipped += result.skipped;
      raw_source_count += result.rawSourceCount;
      expected_count += result.expectedDistinctCount;
      found_count += result.foundCount;
      upserted += result.upserted;
      failed += result.failed;
      duplicate_source_keys += result.duplicateSourceKeys;
      attempts = Math.max(attempts, result.attempts);
    }

    const missing_count = Math.max(0, expected_count - found_count);
    const success = missing_count === 0 && failed === 0;
    if (success) logs.push("SUCCESS: unified_pois last_merge_session count equals source distinct key count exactly.");
    else errors.push(`FAILED: unified_pois did not reach exact parity. Expected distinct: ${expected_count}, Found: ${found_count}, Missing: ${missing_count}, Failed rows: ${failed}.`);

    const response: GeoMergeResponse = {
      status: success ? "SUCCESS" : "FAILED",
      success,
      load_session_id: loadSessionId,
      provider: payload.provider,
      countryCode,
      inserted,
      updated,
      skipped,
      errors,
      retry_logs: logs,
      raw_source_count,
      expected_count,
      found_count,
      missing_count,
      upserted,
      failed,
      duplicate_source_keys,
      attempts,
      duration_ms: Date.now() - startedAt,
    };

    return NextResponse.json(response, { status: success ? 200 : 409 });
  } catch (err) {
    return NextResponse.json(
      {
        status: "FAILED",
        success: false,
        load_session_id: loadSessionId,
        provider: "unknown",
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Merge failed"],
        retry_logs: [],
        raw_source_count: 0,
        expected_count: 0,
        found_count: 0,
        missing_count: 0,
        upserted: 0,
        failed: 0,
        duplicate_source_keys: 0,
        attempts: 0,
        duration_ms: Date.now() - startedAt,
      } satisfies GeoMergeResponse,
      { status: 500 },
    );
  }
}
