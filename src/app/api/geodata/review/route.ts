import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const table = url.searchParams.get("table") ?? "unified_pois";
    const country = url.searchParams.get("country");
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? "50")));

    const allowed = ["geoapify_pois", "tomtom_pois", "unified_pois"];
    if (!allowed.includes(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });

    const sb = getSupabaseAdmin();

    const columns = table === "unified_pois"
      ? "id, name, categories, country_code, formatted_address, lat, lon, phone, website, source_provider, unified_at"
      : table === "geoapify_pois"
        ? "id, name, categories, country_code, formatted_address, lat, lon, phone, website, fetched_at, fetch_category"
        : "id, name, categories, country_code, freeform_address, lat, lon, phone, url, fetched_at, fetch_category";

    let query = sb
      .from(table)
      .select(columns, { count: "exact" })
      .range((page - 1) * pageSize, page * pageSize - 1)
      .order("name", { ascending: true, nullsFirst: false });

    if (country) query = query.eq("country_code", country);
    if (category && table !== "unified_pois") query = query.eq("fetch_category", category);
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Normalize tomtom's freeform_address to formatted_address for UI
    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      formatted_address: r.formatted_address ?? r.freeform_address ?? null,
    }));

    return NextResponse.json({ rows, total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Review failed" }, { status: 500 });
  }
}
