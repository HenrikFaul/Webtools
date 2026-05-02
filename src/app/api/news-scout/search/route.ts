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

// ── Saját crawl_index keresés (PostgreSQL teljes szöveges keresés) ─────────

async function searchLocalIndex(
  db: ReturnType<typeof getSupabaseAdmin>,
  query: string,
  num: number,
): Promise<SearchResult[]> {
  // websearch típusú tsquery: a Supabase textSearch ezt natívan támogatja
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const normalizedQuery = query.replace(/^"(.*)"$/, "$1").trim();
  const q = normalizedQuery || query;

  const { data, error } = await db
    .from("crawl_index")
    .select("url, title, snippet, published_at, relevance_score, crawled_at")
    .textSearch("search_tsv", q, { type: "websearch", config: "simple" })
    .gte("crawled_at", thirtyDaysAgo)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(num);

  if (error || !data?.length) {
    const { data: ilikeData } = await db
      .from("crawl_index")
      .select("url, title, snippet, published_at, crawled_at")
      .or(`title.ilike.%${q}%,snippet.ilike.%${q}%`)
      .gte("crawled_at", thirtyDaysAgo)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(num);

    if (!ilikeData?.length) return [];
    return ilikeData.map((row) => ({
      link: row.url,
      title: row.title ?? "(cím nélkül)",
      snippet: row.snippet ?? "",
    }));
  }

  return data.map((row) => ({
    link: row.url,
    title: row.title ?? "(cím nélkül)",
    snippet: row.snippet ?? "",
  }));
}

// ── Keresési stratégia: kizárólag saját index (külső fallback nélkül) ─────

async function runSearch(
  db: ReturnType<typeof getSupabaseAdmin>,
  query: string,
  num: number,
): Promise<{ results: SearchResult[]; engine_used: string }> {
  try {
    const results = await searchLocalIndex(db, query, num);
    if (results.length > 0) {
      return { results, engine_used: "local_crawler_index" };
    }
    return { results: [], engine_used: "local_crawler_index (no_results)" };
  } catch {
    return { results: [], engine_used: "local_crawler_index (error)" };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────

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
    const { results, engine_used } = await runSearch(db, query, num);

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
