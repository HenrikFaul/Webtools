import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  try {
    const db = getSupabaseAdmin();

    // Read webhook URL from config
    const { data: cfg } = await db
      .from("news_scout_config")
      .select("webhook_url, lookback_days, search_engines")
      .limit(1)
      .maybeSingle();

    // Create a queued run record
    const { data: run, error: runErr } = await db
      .from("news_scan_runs")
      .insert({
        scope_description: "Manuális futtatás a Hírfelderítő Motor felületéről",
        status: "queued",
        trigger_type: "manual",
      })
      .select("run_id, status, started_at")
      .single();

    if (runErr) {
      return NextResponse.json({ error: runErr.message }, { status: 500 });
    }

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
