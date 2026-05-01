import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const status = url.searchParams.get("status");
    const offset = (page - 1) * pageSize;

    const db = getSupabaseAdmin();

    let query = db
      .from("news_scan_runs")
      .select("*", { count: "exact" })
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const total = count ?? 0;
    const runs = (data ?? []).map((r) => ({
      ...r,
      duration_ms:
        r.finished_at && r.started_at
          ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
          : null,
    }));

    return NextResponse.json({
      runs,
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
