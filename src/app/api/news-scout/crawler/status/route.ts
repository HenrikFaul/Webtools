import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface CrawlerStatusResponse {
  active_seeds: number;
  queue_pending: number;
  queue_processing: number;
  queue_done: number;
  queue_failed: number;
  index_total: number;
  index_rss_items: number;
  last_crawled_at: string | null;
  indexed_last_24h: number;
  top_domains: Array<{ domain: string; count: number }>;
  top_categories: Array<{ category: string; count: number }>;
}

export async function GET(): Promise<NextResponse<CrawlerStatusResponse>> {
  const db = getSupabaseAdmin();

  const [statusResult, topDomainsResult, topCategoriesResult] = await Promise.all([
    db.from("v_crawler_status").select("*").maybeSingle(),
    db
      .from("crawl_index")
      .select("domain")
      .order("crawled_at", { ascending: false })
      .limit(1000),
    db
      .from("crawl_index")
      .select("categories")
      .limit(2000),
  ]);

  const s = statusResult.data ?? {};

  // Domain-statisztika számítás
  const domainCounts: Record<string, number> = {};
  for (const row of (topDomainsResult.data ?? [])) {
    domainCounts[row.domain] = (domainCounts[row.domain] ?? 0) + 1;
  }
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  // Kategória-statisztika
  const catCounts: Record<string, number> = {};
  for (const row of (topCategoriesResult.data ?? [])) {
    for (const cat of (row.categories ?? [])) {
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    }
  }
  const topCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, count]) => ({ category, count }));

  return NextResponse.json({
    active_seeds: Number(s.active_seeds ?? 0),
    queue_pending: Number(s.queue_pending ?? 0),
    queue_processing: Number(s.queue_processing ?? 0),
    queue_done: Number(s.queue_done ?? 0),
    queue_failed: Number(s.queue_failed ?? 0),
    index_total: Number(s.index_total ?? 0),
    index_rss_items: Number(s.index_rss_items ?? 0),
    last_crawled_at: s.last_crawled_at ?? null,
    indexed_last_24h: Number(s.indexed_last_24h ?? 0),
    top_domains: topDomains,
    top_categories: topCategories,
  });
}
