import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  fetchUrl,
  isAllowedByRobots,
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

const BATCH_SIZE = 10;      // hány URL-t dolgoz fel egy futásban
const MAX_LINK_DEPTH = 2;   // max lánchossz egy seed-től

interface CrawlStats {
  processed: number;
  indexed: number;
  feeds_found: number;
  links_queued: number;
  errors: number;
  skipped: number;
}

// ── Seed-ek betöltése a queue-ba ───────────────────────────────────────────
async function enqueueDueSeeds(db: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const { data: seeds } = await db
    .from("crawl_seeds")
    .select("id, url, domain, is_rss, crawl_interval_minutes, last_crawled_at")
    .eq("active", true);

  if (!seeds?.length) return 0;

  const now = Date.now();
  const dueSeeds: typeof seeds = [];

  for (const seed of seeds) {
    const lastMs = seed.last_crawled_at ? new Date(seed.last_crawled_at).getTime() : 0;
    const intervalMs = (seed.crawl_interval_minutes ?? 120) * 60_000;
    if (now - lastMs < intervalMs) continue;
    dueSeeds.push(seed);
  }

  if (!dueSeeds.length) return 0;

  const scheduledAt = new Date().toISOString();
  const rows = dueSeeds.map((seed) => ({
    url: seed.url,
    domain: seed.domain,
    seed_id: seed.id,
    depth: 0,
    is_rss: seed.is_rss,
    priority: seed.is_rss ? 1 : 3,
    status: "pending",
    scheduled_at: scheduledAt,
  }));

  // Új elemek beillesztése (már várakozók érintetlenül maradnak)
  const { error: insertErr } = await db
    .from("crawl_queue")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
  if (insertErr) {
    throw new Error(`crawl_queue bulk upsert failed: ${insertErr.message}`);
  }

  // Korábban hibás elemek visszaállítása "pending"-re, ha az intervallum lejárt
  const dueUrls = dueSeeds.map((s) => s.url);
  await db
    .from("crawl_queue")
    .update({ status: "pending", scheduled_at: scheduledAt, error_message: null, attempts: 0 })
    .in("url", dueUrls)
    .eq("status", "failed");

  return dueSeeds.length;
}

// ── Egy RSS feed feldolgozása ──────────────────────────────────────────────
async function processRssFeed(
  db: ReturnType<typeof getSupabaseAdmin>,
  url: string,
  seedId: string | null,
  stats: CrawlStats,
): Promise<void> {
  const result = await fetchUrl(url);
  if (!result.ok) {
    throw new Error(`RSS fetch failed (${result.status}) for ${url}: ${result.error ?? "HTTP error"}`);
  }

  const feed = parseFeed(result.body);
  if (!feed || feed.items.length === 0) {
    stats.skipped++;
    return;
  }

  const domain = extractDomain(url);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const item of feed.items) {
    if (!item.link) continue;

    // Csak 30 napon belüli tartalom
    if (item.publishedAt && item.publishedAt < thirtyDaysAgo) continue;

    const canonical = canonicalizeUrl(item.link);
    if (!canonical) continue;

    const text = `${item.title} ${item.snippet}`;
    if (!isRelevant(text)) continue;

    const categories = detectCategories(text);
    const relevance = scoreRelevance(text);

    const { error: upsertErr } = await db.from("crawl_index").upsert(
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
        source_type: null,
        categories,
        relevance_score: relevance,
      },
      { onConflict: "canonical_url" }
    );

    if (upsertErr) {
      throw new Error(`crawl_index upsert failed for ${item.link}: ${upsertErr.message}`);
    }

    stats.indexed++;
  }

  stats.feeds_found++;

  // Seed utolsó crawl idejének frissítése
  if (seedId) {
    await db.from("crawl_seeds").update({ last_crawled_at: new Date().toISOString() }).eq("id", seedId);
  }
}

// ── Egy HTML oldal feldolgozása ────────────────────────────────────────────
async function processHtmlPage(
  db: ReturnType<typeof getSupabaseAdmin>,
  url: string,
  domain: string,
  depth: number,
  seedId: string | null,
  stats: CrawlStats,
): Promise<void> {
  // robots.txt ellenőrzés
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    stats.skipped++;
    return;
  }

  const result = await fetchUrl(url);
  if (!result.ok) {
    throw new Error(`HTML fetch failed (${result.status}) for ${url}: ${result.error ?? "HTTP error"}`);
  }

  // Ha feed-et kaptunk vissza, kezeljük feed-ként
  if (isFeedContent(result.contentType, result.body)) {
    await processRssFeed(db, url, seedId, stats);
    return;
  }

  const page = extractPage(result.body, result.finalUrl || url);
  const text = `${page.title} ${page.snippet}`;

  // Feed URL-ek hozzáadása a queue-hoz (magas prioritás)
  for (const feedUrl of page.feedUrls) {
    const canonical = canonicalizeUrl(feedUrl);
    if (!canonical) continue;
    const { error: queueFeedErr } = await db.from("crawl_queue").upsert(
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
    if (queueFeedErr) {
      throw new Error(`crawl_queue upsert failed for feed ${feedUrl}: ${queueFeedErr.message}`);
    }
    stats.links_queued++;
  }

  // Ha releváns tartalom, indexeljük
  if (isRelevant(text)) {
    const canonical = canonicalizeUrl(url);
    if (canonical) {
      const categories = detectCategories(text);
      const relevance = scoreRelevance(text);

      const { error: pageUpsertErr } = await db.from("crawl_index").upsert(
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
          categories,
          relevance_score: relevance,
        },
        { onConflict: "canonical_url" }
      );
      if (pageUpsertErr) {
        throw new Error(`crawl_index upsert failed for ${url}: ${pageUpsertErr.message}`);
      }
      stats.indexed++;
    }
  } else {
    stats.skipped++;
  }

  // Linkek hozzáadása a queue-hoz (ha nem értük el a max mélységet)
  if (depth < MAX_LINK_DEPTH) {
    let linkCount = 0;
    for (const link of page.links) {
      if (linkCount >= 20) break; // max 20 link per oldal
      const resolved = resolveUrl(url, link);
      if (!shouldCrawl(resolved, domain, depth + 1, MAX_LINK_DEPTH)) continue;
      const linkDomain = extractDomain(resolved);

      const { error: queueLinkErr } = await db.from("crawl_queue").upsert(
        {
          url: resolved,
          domain: linkDomain,
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
      if (queueLinkErr) {
        throw new Error(`crawl_queue upsert failed for link ${resolved}: ${queueLinkErr.message}`);
      }
      stats.links_queued++;
      linkCount++;
    }
  }

  // Seed utolsó crawl idejének frissítése
  if (seedId && depth === 0) {
    await db.from("crawl_seeds").update({ last_crawled_at: new Date().toISOString() }).eq("id", seedId);
  }
}

// ── Fő handler ─────────────────────────────────────────────────────────────
export async function POST(): Promise<NextResponse> {
  try {
    const db = getSupabaseAdmin();

    // 1. Seed-ek betöltése a queue-ba (ha esedékesek)
    const enqueued = await enqueueDueSeeds(db);

    // 2. Következő BATCH_SIZE darab feldolgozandó URL lekérése
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
    const stats: CrawlStats = { processed: 0, indexed: 0, feeds_found: 0, links_queued: 0, errors: 0, skipped: 0 };
    const recentErrors: string[] = [];

    // 3. URL-ek feldolgozása
    for (const item of items) {
      // "processing" állapotba kerül
      await db.from("crawl_queue").update({
        status: "processing",
        started_at: new Date().toISOString(),
        attempts: 1,
      }).eq("id", item.id);

      try {
        if (item.is_rss) {
          await processRssFeed(db, item.url, item.seed_id, stats);
        } else {
          await processHtmlPage(db, item.url, item.domain, item.depth ?? 0, item.seed_id, stats);
        }

        await db.from("crawl_queue").update({
          status: "done",
          finished_at: new Date().toISOString(),
        }).eq("id", item.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ismeretlen hiba";
        await db.from("crawl_queue").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
        }).eq("id", item.id);
        if (recentErrors.length < 10) recentErrors.push(`${item.url}: ${message}`);
        stats.errors++;
      }

      stats.processed++;
    }

    return NextResponse.json({
      ok: true,
      seeds_enqueued: enqueued,
      queue_items_processed: items.length,
      stats,
      recent_errors: recentErrors,
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
