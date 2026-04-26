import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoStatsResponse } from "@/types/geodata";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();

    const [geoRes, tomRes, uniRes] = await Promise.all([
      sb.from("geoapify_pois").select("country_code", { count: "exact", head: false }),
      sb.from("tomtom_pois").select("country_code", { count: "exact", head: false }),
      sb.from("unified_pois").select("country_code", { count: "exact", head: false }),
    ]);

    function countByCountry(rows: { country_code: string }[] | null): Record<string, number> {
      const map: Record<string, number> = {};
      for (const r of rows ?? []) {
        map[r.country_code] = (map[r.country_code] ?? 0) + 1;
      }
      return map;
    }

    const stats: GeoStatsResponse = {
      geoapify_count: geoRes.data?.length ?? 0,
      tomtom_count: tomRes.data?.length ?? 0,
      unified_count: uniRes.data?.length ?? 0,
      geoapify_by_country: countByCountry(geoRes.data as { country_code: string }[] | null),
      tomtom_by_country: countByCountry(tomRes.data as { country_code: string }[] | null),
      unified_by_country: countByCountry(uniRes.data as { country_code: string }[] | null),
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stats fetch failed" },
      { status: 500 }
    );
  }
}
