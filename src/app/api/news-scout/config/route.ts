import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { NewsScoutConfigSaveRequest } from "@/types/newsScout";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("news_scout_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!data) {
      return NextResponse.json({
        id: null,
        schedule_enabled: false,
        schedule_type: "hours",
        schedule_value: 6,
        search_engines: ["google", "bing"],
        lookback_days: 30,
        webhook_url: null,
        notes: null,
        watchdog_timeout_minutes: 15,
        max_concurrent_runs: 1,
        api_keys: {},
        updated_at: null,
        created_at: null,
      });
    }

    return NextResponse.json({
      ...data,
      search_engines: Array.isArray(data.search_engines) ? data.search_engines : ["google", "bing"],
      api_keys: (data.api_keys && typeof data.api_keys === "object") ? data.api_keys : {},
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NewsScoutConfigSaveRequest;

    if (!body.schedule_type || !["minutes", "hours", "days"].includes(body.schedule_type)) {
      return NextResponse.json({ error: "Érvénytelen schedule_type" }, { status: 400 });
    }
    if (typeof body.schedule_value !== "number" || body.schedule_value < 1) {
      return NextResponse.json({ error: "Érvénytelen schedule_value" }, { status: 400 });
    }
    if (!Array.isArray(body.search_engines) || body.search_engines.length === 0) {
      return NextResponse.json({ error: "Legalább egy keresőmotor szükséges" }, { status: 400 });
    }
    if (typeof body.lookback_days !== "number" || body.lookback_days < 1 || body.lookback_days > 365) {
      return NextResponse.json({ error: "lookback_days: 1–365 között kell lennie" }, { status: 400 });
    }

    // Sanitize api_keys: only allow string values, strip null/undefined
    const rawKeys = body.api_keys ?? {};
    const apiKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawKeys)) {
      if (typeof v === "string") apiKeys[k] = v;
    }

    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from("news_scout_config")
      .select("id, api_keys")
      .limit(1)
      .maybeSingle();

    // Merge new api_keys over existing ones (preserves keys not sent in this request)
    const mergedKeys = { ...(existing?.api_keys ?? {}), ...apiKeys };

    const payload = {
      schedule_enabled: Boolean(body.schedule_enabled),
      schedule_type: body.schedule_type,
      schedule_value: body.schedule_value,
      search_engines: body.search_engines,
      lookback_days: body.lookback_days,
      webhook_url: body.webhook_url ?? null,
      notes: body.notes ?? null,
      watchdog_timeout_minutes: body.watchdog_timeout_minutes ?? 15,
      max_concurrent_runs: body.max_concurrent_runs ?? 1,
      api_keys: mergedKeys,
    };

    let result;
    if (existing?.id) {
      result = await db
        .from("news_scout_config")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
    } else {
      result = await db
        .from("news_scout_config")
        .insert(payload)
        .select("*")
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ...result.data,
      api_keys: (result.data.api_keys && typeof result.data.api_keys === "object") ? result.data.api_keys : {},
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON" },
      { status: 400 }
    );
  }
}
