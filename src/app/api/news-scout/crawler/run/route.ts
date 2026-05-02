import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  fetchUrl,
  parseFeed,
  isFeedContent,
  extractPage,
  detectCategories,
  scoreRelevance,
  isRelevant,
  canonicalizeUrl,
  extractDomain,
  shouldCrawl,
  resolveUrl,
} from "@/lib/crawler";

const BATCH_SIZE = 5;       // Vercel serverless: kis batch, gyors futás
const MAX_LINK_DEPTH = 2;

interface CrawlStats {
  processed: number;
  indexed: number;
  feeds_found: number;
  links_queued: number;
  errors: number;
  skipped: number;
  error_details: Array<{ url: string; error: string; status?: number }>;
}

// ── Seed-ek betöltése a queue-ba ───────────────────────────────────────────
async function enqueueDueSeeds(db: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const { data: seeds } = await db
    .from("crawl_seeds")
    .select("id, url, domain, is_rss, crawl_interval_minutes, last_crawled_at")
    .eq("active", true);

  if (!seeds?.length) return 0;

  let enqueued = 0;
  const now = Date.now();

  for (const seed of seeds) {
    const lastMs = seed.last_crawled_at ? new Date(seed.last_crawled_at).getTime() : 0;
    const intervalMs = (seed.crawl_interval_minutes ?? 120) * 60_000;
    if (now - lastMs < intervalMs) continue;

    await db.from("crawl_queue").upsert(
      {
        url: seed.url,
        domain: seed.domain,
        seed_id: seed.id,
        depth: 0,
        is_rss: seed.is_rss,
        priority: seed.is_rss ? 1 : 3,
        status: "pending",
        scheduled_at: new Date().toISOString(),
      },
      { onConflict: "url", ignoreDuplicates: true }
    );
    enqueued++;
  }

  return enqueued;
}

// ── Egy RSS feed feldolgozása ─────────────────────────────────────────────
// Visszaad: indexelt elemek száma, vagy dob hibát
async function processRssFeed(
  db: ReturnType<typeof getSupabaseAdmin>,
  url: string,
  seedId: string | null,
): Promise<{ indexed: number; feeds_found: number }> {
  const result = await fetchUrl(url);

  if (!result.ok) {
    throw new Error(`HTTP ${result.status || 'network'}: ${result.error ?? 'ismeretlen hiba'} — ${url}`);
  }

  const feed = parseFeed(result.body);
  if (!feed || feed.items.length === 0) {
    return { indexed: 0, feeds_found: 0 };
  }

  const domain = extractDomain(url);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let indexed = 0;

  for (const item of feed.items) {
    if (!item.link) continue;
    if (item.publishedAt && item.publishedAt < thirtyDaysAgo) continue;

    const canonical = canonicalizeUrl(item.link);
    if (!canonical) continue;

    const text = `${item.title} ${item.snippet}`;
    if (!isRelevant(text)) continue;

    await db.from("crawl_index").upsert(
      {
        url: item.link,
        canonical_url: canonical,
        domain,
        title: item.title.slice(0, 500),
        snippet: item.snippet.slice(0, 500),
        published_at: item.publishedAt?.toISOString() ?? null,
        crawled_at: new Date().toISOString(),
        is_rss_item: true,
        feed_url: url,
        categories: detectCategories(text),
        relevance_score: scoreRelevance(text),
      },
      { onConflict: "canonical_url" }
    );
    indexed++;
  }

  if (seedId) {
    await db.from("crawl_seeds").update({ last_crawled_at: new Date().toISOString() }).eq("id", seedId);
  }

  return { indexed, feeds_found: 1 };
}

// ── Egy HTML oldal feldolgozása ───────────────────────────────────────────
async function processHtmlPage(
  db: ReturnType<typeof getSupabaseAdmin>,
  url: string,
  domain: string,
  depth: number,
  seedId: string | null,
): Promise<{ indexed: number; feeds_found: number; links_queued: number }> {
  const result = await fetchUrl(url);

  if (!result.ok) {
    throw new Error(`HTTP ${result.status || 'network'}: ${result.error ?? 'ismeretlen hiba'} — ${url}`);
  }

  // Ha feed tartalom érkezett vissza, kezeljük feed-ként
  if (isFeedContent(result.contentType, result.body)) {
    const r = await processRssFeed(db, url, seedId);
    return { ...r, links_queued: 0 };
  }

  const page = extractPage(result.body, result.finalUrl || url);
  const text = `${page.title} ${page.snippet}`;
  let indexed = 0;
  let feeds_found = 0;
  let links_queued = 0;

  // Feed URL-ek → queue (legmagasabb prioritás)
  for (const feedUrl of page.feedUrls) {
    const canonical = canonicalizeUrl(feedUrl);
    if (!canonical) continue;
    await db.from("crawl_queue").upsert(
      {
        url: feedUrl,
        domain: extractDomain(feedUrl),
        seed_id: seedId,
        depth: depth + 1,
        parent_url: url,
        is_rss: true,
        priority: 1,
        status: "pending",
        scheduled_at: new Date().toISOString(),
      },
      { onConflict: "url", ignoreDuplicates: true }
    );
    feeds_found++;
    links_queued++;
  }

  // Releváns tartalom indexelése
  if (isRelevant(text)) {
    const canonical = canonicalizeUrl(url);
    if (canonical) {
      await db.from("crawl_index").upsert(
        {
          url,
          canonical_url: canonical,
          domain,
          title: page.title.slice(0, 500),
          snippet: page.snippet.slice(0, 500),
          published_at: page.publishedAt?.toISOString() ?? null,
          crawled_at: new Date().toISOString(),
          is_rss_item: false,
          feed_url: page.feedUrls[0] ?? null,
          categories: detectCategories(text),
          relevance_score: scoreRelevance(text),
        },
        { onConflict: "canonical_url" }
      );
      indexed++;
    }
  }

  // Linkek → queue (csak ha nem értük el a max mélységet)
  if (depth < MAX_LINK_DEPTH) {
    let linkCount = 0;
    for (const link of page.links) {
      if (linkCount >= 15) break;
      const resolved = resolveUrl(url, link);
      if (!shouldCrawl(resolved, domain, depth + 1, MAX_LINK_DEPTH)) continue;

      await db.from("crawl_queue").upsert(
        {
          url: resolved,
          domain: extractDomain(resolved),
          seed_id: seedId,
          depth: depth + 1,
          parent_url: url,
          is_rss: false,
          priority: 5,
          status: "pending",
          scheduled_at: new Date().toISOString(),
        },
        { onConflict: "url", ignoreDuplicates: true }
      );
      links_queued++;
      linkCount++;
    }
  }

  if (seedId && depth === 0) {
    await db.from("crawl_seeds").update({ last_crawled_at: new Date().toISOString() }).eq("id", seedId);
  }

  return { indexed, feeds_found, links_queued };
}

// ── Fő handler ────────────────────────────────────────────────────────────
export async function POST(): Promise<NextResponse> {
  try {
    const db = getSupabaseAdmin();

    // 1. Seed-ek betöltése a queue-ba
    const seeds_enqueued = await enqueueDueSeeds(db);

    // 2. Következő BATCH_SIZE darab URL lekérése
    const { data: queueItems, error: queueErr } = await db
      .from("crawl_queue")
      .select("id, url, domain, depth, seed_id, is_rss, parent_url")
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (queueErr) {
      return NextResponse.json({ error: queueErr.message }, { status: 500 });
    }

    const items = queueItems ?? [];
    const stats: CrawlStats = {
      processed: 0, indexed: 0, feeds_found: 0,
      links_queued: 0, errors: 0, skipped: 0,
      error_details: [],
    };

    // 3. URL-ek feldolgozása
    for (const item of items) {
      await db.from("crawl_queue").update({
        status: "processing",
        started_at: new Date().toISOString(),
        attempts: 1,
      }).eq("id", item.id);

      try {
        let result: { indexed: number; feeds_found: number; links_queued: number };

        if (item.is_rss) {
          const r = await processRssFeed(db, item.url, item.seed_id);
          result = { ...r, links_queued: 0 };
        } else {
          result = await processHtmlPage(db, item.url, item.domain, item.depth ?? 0, item.seed_id);
        }

        stats.indexed      += result.indexed;
        stats.feeds_found  += result.feeds_found;
        stats.links_queued += result.links_queued;

        await db.from("crawl_queue").update({
          status: "done",
          finished_at: new Date().toISOString(),
        }).eq("id", item.id);

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Ismeretlen hiba";

        await db.from("crawl_queue").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: errMsg,
        }).eq("id", item.id);

        stats.errors++;
        stats.error_details.push({ url: item.url, error: errMsg });
      }

      stats.processed++;
    }

    return NextResponse.json({
      ok: true,
      seeds_enqueued,
      queue_items_processed: items.length,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return POST();
}
