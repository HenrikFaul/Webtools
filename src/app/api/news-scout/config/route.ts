import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { NewsScoutConfigSaveRequest } from "@/types/newsScout";

function isApiKeysColumnMissing(msg: string) {
  return msg.includes("api_keys") && (msg.includes("schema cache") || msg.includes("column"));
}

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("news_scout_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    // If api_keys column doesn't exist yet (v3 migration not run), fall back without it
    if (error) {
      if (isApiKeysColumnMissing(error.message)) {
        const { data: data2, error: err2 } = await db
          .from("news_scout_config")
          .select("id, schedule_enabled, schedule_type, schedule_value, search_engines, lookback_days, webhook_url, notes, watchdog_timeout_minutes, max_concurrent_runs, updated_at, created_at")
          .limit(1)
          .maybeSingle();
        if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });
        return NextResponse.json({
          ...(data2 ?? {}),
          search_engines: Array.isArray(data2?.search_engines) ? data2.search_engines : ["google", "bing"],
          api_keys: {},
          _migration_v3_needed: true,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

    // Sanitize api_keys: only allow string values
    const rawKeys = body.api_keys ?? {};
    const apiKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawKeys)) {
      if (typeof v === "string") apiKeys[k] = v;
    }

    const db = getSupabaseAdmin();

    // Try to read existing row (with api_keys if available)
    let existingId: string | undefined;
    let existingApiKeys: Record<string, string> = {};
    let hasApiKeysColumn = true;

    const { data: existing, error: existingErr } = await db
      .from("news_scout_config")
      .select("id, api_keys")
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      if (isApiKeysColumnMissing(existingErr.message)) {
        hasApiKeysColumn = false;
        // Re-fetch without api_keys
        const { data: existing2 } = await db
          .from("news_scout_config")
          .select("id")
          .limit(1)
          .maybeSingle();
        existingId = existing2?.id;
      } else {
        return NextResponse.json({ error: existingErr.message }, { status: 500 });
      }
    } else {
      existingId = existing?.id;
      existingApiKeys = (existing?.api_keys && typeof existing.api_keys === "object")
        ? (existing.api_keys as Record<string, string>)
        : {};
    }

    const mergedKeys = { ...existingApiKeys, ...apiKeys };

    const basePayload = {
      schedule_enabled: Boolean(body.schedule_enabled),
      schedule_type: body.schedule_type,
      schedule_value: body.schedule_value,
      search_engines: body.search_engines,
      lookback_days: body.lookback_days,
      webhook_url: body.webhook_url ?? null,
      notes: body.notes ?? null,
      watchdog_timeout_minutes: body.watchdog_timeout_minutes ?? 15,
      max_concurrent_runs: body.max_concurrent_runs ?? 1,
    };

    const payload = hasApiKeysColumn
      ? { ...basePayload, api_keys: mergedKeys }
      : basePayload;

    let result;
    if (existingId) {
      result = await db
        .from("news_scout_config")
        .update(payload)
        .eq("id", existingId)
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
      // Last resort: retry without api_keys if column is still missing
      if (isApiKeysColumnMissing(result.error.message)) {
        const result2 = existingId
          ? await db.from("news_scout_config").update(basePayload).eq("id", existingId).select("*").single()
          : await db.from("news_scout_config").insert(basePayload).select("*").single();
        if (result2.error) return NextResponse.json({ error: result2.error.message }, { status: 500 });
        return NextResponse.json({ ...result2.data, api_keys: {}, _migration_v3_needed: true });
      }
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
