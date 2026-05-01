import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const REQUIRED_TABLES = [
  "news_scan_runs",
  "news_source_channels",
  "news_source_scan_log",
  "location_registry",
  "news_scout_config",
] as const;

export async function GET() {
  try {
    const db = getSupabaseAdmin();

    const tableStatus: Record<string, boolean> = {};

    await Promise.all(
      REQUIRED_TABLES.map(async (tbl) => {
        try {
          const { error } = await db.from(tbl).select("*").limit(0);
          tableStatus[tbl] = !error;
        } catch {
          tableStatus[tbl] = false;
        }
      })
    );

    const all_ready = Object.values(tableStatus).every(Boolean);

    return NextResponse.json({
      tables: tableStatus,
      all_ready,
      migration_sql_path: "supabase/migrations/news_scout_tables.sql",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
