import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const ALLOWED_TABLES = [
  "geoapify_pois",
  "tomtom_pois",
  "aws_pois",
  "unified_pois",
  "local_pois",
] as const;
type StatsTable = (typeof ALLOWED_TABLES)[number];

async function countTable(
  sb: ReturnType<typeof getSupabaseAdmin>,
  table: StatsTable,
  country?: string,
): Promise<number> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (country) q = q.eq("country_code", country);
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || undefined;
    const table = url.searchParams.get("table") || undefined;

    const sb = getSupabaseAdmin();

    // Single-table mode: called by individual badge refresh
    if (table) {
      if (!(ALLOWED_TABLES as readonly string[]).includes(table)) {
        return NextResponse.json({ error: "Invalid table" }, { status: 400 });
      }
      const count = await countTable(sb, table as StatsTable, country);
      return NextResponse.json({ table, count, country: country ?? null });
    }

    // All-tables mode (backward compat — also used by load-after-operation refresh)
    const counts = await Promise.all(ALLOWED_TABLES.map((t) => countTable(sb, t, country)));
    const [geo, tom, aws, uni, local] = counts;

    return NextResponse.json({
      geoapify_count: geo,
      tomtom_count: tom,
      aws_count: aws,
      unified_count: uni,
      local_count: local,
      country: country ?? null,
      geoapify_by_country: {},
      tomtom_by_country: {},
      aws_by_country: {},
      unified_by_country: {},
      local_by_country: {},
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stats fetch failed" },
      { status: 500 },
    );
  }
}
