import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

interface TriggerBody {
  force?: boolean;
}

export async function POST(req: Request) {
  try {
    let body: TriggerBody = {};
    try {
      body = (await req.json()) as TriggerBody;
    } catch {
      // empty body OK
    }

    const db = getSupabaseAdmin();

    // Read config: webhook URL, lookback, engines, max concurrent
    const { data: cfg } = await db
      .from("news_scout_config")
      .select("webhook_url, lookback_days, search_engines, max_concurrent_runs, watchdog_timeout_minutes")
      .limit(1)
      .maybeSingle();

    const maxConcurrent = cfg?.max_concurrent_runs ?? 1;

    // Guard: check for already active runs
    if (!body.force) {
      const { data: activeRuns, error: activeErr } = await db
        .from("news_scan_runs")
        .select("run_id, status, started_at, progress_processed, progress_total")
        .in("status", ["queued", "running"])
        .order("started_at", { ascending: false });

      if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });

      if ((activeRuns ?? []).length >= maxConcurrent) {
        return NextResponse.json(
          {
            error: "already_active",
            message: `Már van ${activeRuns!.length} aktív futás (max: ${maxConcurrent}). Előbb állítsd le, vagy használd a force=true opciót.`,
            active_runs: activeRuns,
          },
          { status: 409 }
        );
      }
    }

    // Create the run record – manual triggers start immediately (running),
    // not queued, because we are kicking it off right now.
    const { data: run, error: runErr } = await db
      .from("news_scan_runs")
      .insert({
        scope_description: "Manuális futtatás a Hírfelderítő Motor felületéről",
        status: "running",
        trigger_type: "manual",
      })
      .select("run_id, status, started_at")
      .single();

    if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

    // Call webhook if configured
    let webhook_called = false;
    let webhook_error: string | undefined;

    if (cfg?.webhook_url) {
      try {
        const webhookRes = await fetch(cfg.webhook_url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run_id: run.run_id,
            trigger_type: "manual",
            lookback_days: cfg.lookback_days ?? 30,
            search_engines: cfg.search_engines ?? ["google", "bing"],
            heartbeat_url: `/api/news-scout/runs/${run.run_id}/heartbeat`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        webhook_called = true;
        if (!webhookRes.ok) {
          webhook_error = `Webhook HTTP ${webhookRes.status}`;
        }
      } catch (err) {
        webhook_called = false;
        webhook_error = err instanceof Error ? err.message : "Webhook hiba";
      }
    }

    return NextResponse.json({
      run_id: run.run_id,
      status: run.status,
      webhook_called,
      webhook_error,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
