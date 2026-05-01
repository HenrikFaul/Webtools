import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const ALLOWED_TABLES = [
  "news_scan_runs",
  "news_source_channels",
  "news_source_scan_log",
  "location_registry",
] as const;

type AllowedTable = (typeof ALLOWED_TABLES)[number];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const table = url.searchParams.get("table") as AllowedTable | null;

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: `Érvénytelen tábla. Megengedett: ${ALLOWED_TABLES.join(", ")}` },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10)));
    const offset = (page - 1) * pageSize;

    const city = url.searchParams.get("city");
    const postcode = url.searchParams.get("postcode");
    const county = url.searchParams.get("county");
    const status = url.searchParams.get("status");
    const hadMatch = url.searchParams.get("had_match");
    const active = url.searchParams.get("active");

    const db = getSupabaseAdmin();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from(table)
      .select("*", { count: "exact" })
      .range(offset, offset + pageSize - 1);

    // Apply common city/postcode/county filters
    if (city) query = query.ilike("city", `%${city}%`);
    if (postcode) query = query.eq("postcode", postcode);
    if (county) query = query.ilike("county_name", `%${county}%`);

    // Table-specific filters
    if (table === "news_scan_runs" && status) {
      query = query.eq("status", status);
    }
    if (table === "news_source_scan_log" && hadMatch !== null) {
      query = query.eq("had_match", hadMatch === "true");
    }
    if (table === "news_source_scan_log" && status) {
      query = query.eq("status", status);
    }
    if (table === "news_source_channels" && active !== null) {
      query = query.eq("active", active === "true");
    }

    // Default sort
    const orderCol =
      table === "news_scan_runs" ? "started_at" :
      table === "news_source_scan_log" ? "scanned_at" :
      table === "location_registry" ? "city" :
      "city";

    query = query.order(orderCol, {
      ascending: table === "location_registry",
      nullsFirst: false,
    });

    const { data, error, count } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const total = count ?? 0;
    return NextResponse.json({
      rows: data ?? [],
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
