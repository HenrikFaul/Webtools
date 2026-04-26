import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoStatsResponse } from "@/types/geodata";

interface CountryRow { country_code: string | null; }

function countByCountry(rows: CountryRow[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of rows ?? []) {
    const key = r.country_code ?? "unknown";
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

async function safeCountryRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<CountryRow[]> {
  const { data, error } = await sb.from(table).select("country_code", { count: "exact", head: false });
  if (error) return [];
  return (data ?? []) as CountryRow[];
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin();

    const [geoRows, tomRows, uniRows, localRows] = await Promise.all([
      safeCountryRows(sb, "geoapify_pois"),
      safeCountryRows(sb, "tomtom_pois"),
      safeCountryRows(sb, "unified_pois"),
      safeCountryRows(sb, "local_pois"),
    ]);

    const stats: GeoStatsResponse = {
      geoapify_count: geoRows.length,
      tomtom_count: tomRows.length,
      unified_count: uniRows.length,
      local_count: localRows.length,
      geoapify_by_country: countByCountry(geoRows),
      tomtom_by_country: countByCountry(tomRows),
      unified_by_country: countByCountry(uniRows),
      local_by_country: countByCountry(localRows),
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stats fetch failed" },
      { status: 500 }
    );
  }
}
