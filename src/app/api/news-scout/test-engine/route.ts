import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const TEST_QUERIES = [
  "Budapest önkormányzat hirdetmény",
  "Győr polgármesteri hivatal",
  "Pécs közgyűlés határozat",
  "Debrecen helyi hírek",
  "Miskolc önkormányzati döntés",
];

function randomQuery() {
  return TEST_QUERIES[Math.floor(Math.random() * TEST_QUERIES.length)];
}

interface TestResult {
  ok: boolean;
  http_status: number;
  result_count: number;
  sample_url?: string;
  error?: string;
}

async function testGoogle(apiKey: string, cx: string, query: string): Promise<TestResult> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("num", "1");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  const http_status = res.status;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, http_status, result_count: 0, error: body.slice(0, 300) };
  }
  const data = await res.json() as { items?: Array<{ link: string }>; searchInformation?: { totalResults: string } };
  const result_count = parseInt(data.searchInformation?.totalResults ?? "0", 10) || (data.items?.length ?? 0);
  return { ok: true, http_status, result_count, sample_url: data.items?.[0]?.link };
}

async function testBing(apiKey: string, query: string): Promise<TestResult> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "1");

  const res = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  const http_status = res.status;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, http_status, result_count: 0, error: body.slice(0, 300) };
  }
  const data = await res.json() as { webPages?: { totalEstimatedMatches?: number; value?: Array<{ url: string }> } };
  const result_count = data.webPages?.totalEstimatedMatches ?? data.webPages?.value?.length ?? 0;
  return { ok: true, http_status, result_count, sample_url: data.webPages?.value?.[0]?.url };
}

async function testDuckDuckGo(searchApiKey: string, query: string): Promise<TestResult> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "duckduckgo");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", searchApiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const http_status = res.status;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, http_status, result_count: 0, error: body.slice(0, 300) };
  }
  const data = await res.json() as { organic_results?: Array<{ link?: string }> };
  const results = data.organic_results ?? [];
  return { ok: true, http_status, result_count: results.length, sample_url: results[0]?.link };
}

async function testBrave(apiKey: string, query: string): Promise<TestResult> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Subscription-Token": apiKey,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  const http_status = res.status;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, http_status, result_count: 0, error: body.slice(0, 300) };
  }
  const data = await res.json() as { web?: { results?: Array<{ url: string }> } };
  const results = data.web?.results ?? [];
  return { ok: true, http_status, result_count: results.length, sample_url: results[0]?.url };
}

async function testSerper(apiKey: string, query: string): Promise<TestResult> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 1 }),
    signal: AbortSignal.timeout(10_000),
  });
  const http_status = res.status;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, http_status, result_count: 0, error: body.slice(0, 300) };
  }
  const data = await res.json() as { organic?: Array<{ link: string }> };
  const results = data.organic ?? [];
  return { ok: true, http_status, result_count: results.length, sample_url: results[0]?.link };
}

async function testSerpApi(apiKey: string, query: string): Promise<TestResult> {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "1");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const http_status = res.status;
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, http_status, result_count: 0, error: body.slice(0, 300) };
  }
  const data = await res.json() as { organic_results?: Array<{ link: string }> };
  const results = data.organic_results ?? [];
  return { ok: true, http_status, result_count: results.length, sample_url: results[0]?.link };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { engine: string; api_keys?: Record<string, string> };
    const { engine } = body;
    if (!engine) return NextResponse.json({ error: "engine required" }, { status: 400 });

    // Use keys from request body first; fall back to DB
    let keys: Record<string, string> = {};
    if (body.api_keys && typeof body.api_keys === "object") {
      keys = body.api_keys as Record<string, string>;
    } else {
      const db = getSupabaseAdmin();
      const { data: cfg } = await db
        .from("news_scout_config")
        .select("api_keys")
        .limit(1)
        .maybeSingle();
      keys = (cfg?.api_keys && typeof cfg.api_keys === "object")
        ? (cfg.api_keys as Record<string, string>)
        : {};
    }

    const query = randomQuery();
    let result: TestResult;
    let endpoint_url = "";
    let endpoint_method = "GET";

    try {
      switch (engine) {
        case "google": {
          const apiKey = keys["google_api_key"] ?? "";
          const cx = keys["google_cx"] ?? "";
          if (!apiKey || !cx) return NextResponse.json({ error: "Hiányzó API key: google_api_key és google_cx szükséges", endpoint_url: "https://www.googleapis.com/customsearch/v1?q=...&key=...&cx=...&num=1" }, { status: 400 });
          endpoint_url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=...&cx=${cx}&num=1`;
          result = await testGoogle(apiKey, cx, query);
          break;
        }
        case "bing": {
          const apiKey = keys["bing_api_key"] ?? "";
          if (!apiKey) return NextResponse.json({ error: "Hiányzó API key: bing_api_key szükséges", endpoint_url: "https://api.bing.microsoft.com/v7.0/search?q=... (Header: Ocp-Apim-Subscription-Key)" }, { status: 400 });
          endpoint_url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=1`;
          result = await testBing(apiKey, query);
          break;
        }
        case "duckduckgo": {
          const apiKey = keys["searchapi_key"] ?? "";
          if (!apiKey) return NextResponse.json({ error: "Hiányzó API key: searchapi_key szükséges", endpoint_url: "https://www.searchapi.io/api/v1/search?engine=duckduckgo&q=...&api_key=..." }, { status: 400 });
          endpoint_url = `https://www.searchapi.io/api/v1/search?engine=duckduckgo&q=${encodeURIComponent(query)}&api_key=...`;
          result = await testDuckDuckGo(apiKey, query);
          break;
        }
        case "brave": {
          const apiKey = keys["brave_api_key"] ?? "";
          if (!apiKey) return NextResponse.json({ error: "Hiányzó API key: brave_api_key szükséges", endpoint_url: "https://api.search.brave.com/res/v1/web/search?q=... (Header: X-Subscription-Token)" }, { status: 400 });
          endpoint_url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=1`;
          result = await testBrave(apiKey, query);
          break;
        }
        case "serper": {
          const apiKey = keys["serper_api_key"] ?? "";
          if (!apiKey) return NextResponse.json({ error: "Hiányzó API key: serper_api_key szükséges", endpoint_url: "POST https://google.serper.dev/search (Header: X-API-KEY)" }, { status: 400 });
          endpoint_url = "https://google.serper.dev/search";
          endpoint_method = "POST";
          result = await testSerper(apiKey, query);
          break;
        }
        case "serpapi": {
          const apiKey = keys["serpapi_key"] ?? "";
          if (!apiKey) return NextResponse.json({ error: "Hiányzó API key: serpapi_key szükséges", endpoint_url: "https://serpapi.com/search?engine=google&q=...&api_key=..." }, { status: 400 });
          endpoint_url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&api_key=...&num=1`;
          result = await testSerpApi(apiKey, query);
          break;
        }
        default:
          return NextResponse.json({ error: `Ismeretlen engine: ${engine}` }, { status: 400 });
      }
    } catch (err) {
      return NextResponse.json({
        ok: false,
        http_status: 0,
        result_count: 0,
        endpoint_url,
        endpoint_method,
        error: err instanceof Error ? err.message : "Hálózati hiba",
      } satisfies TestEngineResponse & { endpoint_url: string; endpoint_method: string });
    }

    return NextResponse.json({ ...result, query, endpoint_url, endpoint_method });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

interface TestEngineResponse {
  ok: boolean;
  http_status: number;
  result_count: number;
  sample_url?: string;
  error?: string;
  endpoint_url?: string;
  endpoint_method?: string;
}
