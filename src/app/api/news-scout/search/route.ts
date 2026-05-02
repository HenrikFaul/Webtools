import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface SearchResult {
  link: string;
  title: string;
  snippet: string;
}

export interface SearchProxyResponse {
  query: string;
  results: SearchResult[];
  result_count: number;
  engine_used: string;
  ok: boolean;
  error?: string;
}

// ── Backend callers ──────────────────────────────────────────────────────────

async function callSerpApi(apiKey: string, query: string, num: number): Promise<SearchResult[]> {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(num));
  url.searchParams.set("gl", "hu");
  url.searchParams.set("hl", "hu");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);

  const data = await res.json() as { organic_results?: Array<{ link: string; title: string; snippet?: string }> };
  return (data.organic_results ?? []).map((r) => ({
    link: r.link,
    title: r.title,
    snippet: r.snippet ?? "",
  }));
}

async function callSearchApiGoogle(apiKey: string, query: string, num: number): Promise<SearchResult[]> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(num));
  url.searchParams.set("gl", "hu");
  url.searchParams.set("hl", "hu");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`SearchAPI(google) ${res.status}`);

  const data = await res.json() as { organic_results?: Array<{ link: string; title: string; snippet?: string }> };
  return (data.organic_results ?? []).map((r) => ({
    link: r.link,
    title: r.title,
    snippet: r.snippet ?? "",
  }));
}

async function callSearchApiBing(apiKey: string, query: string, num: number): Promise<SearchResult[]> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "bing");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(num));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`SearchAPI(bing) ${res.status}`);

  const data = await res.json() as { organic_results?: Array<{ link: string; title: string; snippet?: string }> };
  return (data.organic_results ?? []).map((r) => ({
    link: r.link,
    title: r.title,
    snippet: r.snippet ?? "",
  }));
}

// ── Priority-ordered search with graceful fallback ───────────────────────────

async function runSearch(
  keys: Record<string, string>,
  query: string,
  num: number,
): Promise<{ results: SearchResult[]; engine_used: string }> {

  // 1. SerpAPI (Google) — highest quality
  if (keys["serpapi_key"]) {
    try {
      const results = await callSerpApi(keys["serpapi_key"], query, num);
      if (results.length > 0) return { results, engine_used: "serpapi/google" };
    } catch {
      // fall through
    }
  }

  // 2. SearchAPI.io — Google engine
  if (keys["searchapi_key"]) {
    try {
      const results = await callSearchApiGoogle(keys["searchapi_key"], query, num);
      if (results.length > 0) return { results, engine_used: "searchapi/google" };
    } catch {
      // fall through
    }
  }

  // 3. SearchAPI.io — Bing engine (different index, useful as fallback)
  if (keys["searchapi_key"]) {
    try {
      const results = await callSearchApiBing(keys["searchapi_key"], query, num);
      if (results.length > 0) return { results, engine_used: "searchapi/bing" };
    } catch {
      // fall through
    }
  }

  // 4. No backend available — return empty results (route stays healthy)
  return { results: [], engine_used: "none" };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}

async function handleRequest(req: Request): Promise<NextResponse<SearchProxyResponse>> {
  const { searchParams } = new URL(req.url);

  const query = (
    searchParams.get("q") ??
    searchParams.get("query") ??
    ""
  ).trim();

  const num = Math.min(Math.max(parseInt(searchParams.get("num") ?? "10", 10), 1), 50);

  if (!query) {
    return NextResponse.json<SearchProxyResponse>({
      query: "",
      results: [],
      result_count: 0,
      engine_used: "none",
      ok: false,
      error: "Hiányzó q paraméter",
    }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: cfg } = await db
      .from("news_scout_config")
      .select("api_keys")
      .limit(1)
      .maybeSingle();

    const keys = (cfg?.api_keys && typeof cfg.api_keys === "object")
      ? (cfg.api_keys as Record<string, string>)
      : {};

    const { results, engine_used } = await runSearch(keys, query, num);

    return NextResponse.json<SearchProxyResponse>({
      query,
      results,
      result_count: results.length,
      engine_used,
      ok: true,
    });
  } catch (err) {
    return NextResponse.json<SearchProxyResponse>({
      query,
      results: [],
      result_count: 0,
      engine_used: "error",
      ok: false,
      error: err instanceof Error ? err.message : "Belső hiba",
    }, { status: 500 });
  }
}
