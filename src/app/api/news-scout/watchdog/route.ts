import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

interface WatchdogResult {
  checked_at: string;
  active_runs_found: number;
  killed: Array<{ run_id: string; was_status: string; reason: string }>;
  timeout_minutes: number;
}

async function getTimeoutMinutes(db: ReturnType<typeof import("@/lib/supabase").getSupabaseAdmin>, bodyTimeout?: number): Promise<number> {
  if (typeof bodyTimeout === "number" && bodyTimeout > 0) return bodyTimeout;
  const { data: cfg } = await db
    .from("news_scout_config")
    .select("watchdog_timeout_minutes")
    .limit(1)
    .maybeSingle();
  return cfg?.watchdog_timeout_minutes ?? 15;
}

export async function POST(req: Request) {
  try {
    const db = getSupabaseAdmin();

    let bodyTimeout: number | undefined;
    try {
      const body = (await req.json()) as { timeout_minutes?: number };
      bodyTimeout = body.timeout_minutes;
    } catch { /* empty body OK */ }

    const timeoutMinutes: number = await getTimeoutMinutes(db, bodyTimeout);

    // Count active runs before killing
    const { count: activeCount } = await db
      .from("news_scan_runs")
      .select("*", { count: "exact", head: true })
      .in("status", ["queued", "running"]);

    // Call the DB-side watchdog function
    const { data, error } = await db.rpc("news_scout_watchdog", {
      p_timeout_minutes: timeoutMinutes,
    });

    if (error) {
      if (error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "A news_scout_watchdog() adatbázis-függvény még nem létezik. " +
              "Futtasd a news_scout_v2_watchdog.sql migrációt a Supabase SQL Editorban.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const killed = (
      (data as Array<{ killed_run_id: string; was_status: string; reason: string }>) ?? []
    ).map((r) => ({
      run_id: r.killed_run_id,
      was_status: r.was_status,
      reason: r.reason,
    }));

    const result: WatchdogResult = {
      checked_at: new Date().toISOString(),
      active_runs_found: activeCount ?? 0,
      killed,
      timeout_minutes: timeoutMinutes,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// GET: report active runs without killing anything
export async function GET() {
  try {
    const db = getSupabaseAdmin();

    const { data: activeRuns, error } = await db
      .from("news_scan_runs")
      .select(
        "run_id, status, started_at, last_heartbeat_at, progress_processed, progress_total, trigger_type"
      )
      .in("status", ["queued", "running"])
      .order("started_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const now = Date.now();
    const runs = (activeRuns ?? []).map((r) => {
      const lastAlive = r.last_heartbeat_at ?? r.started_at;
      const silentMs = lastAlive ? now - new Date(lastAlive).getTime() : null;
      return {
        ...r,
        silent_ms: silentMs,
        silent_minutes: silentMs != null ? Math.floor(silentMs / 60_000) : null,
      };
    });

    return NextResponse.json({ active_runs: runs, checked_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
