// RSS 2.0 és Atom feed parser — külső dependency nélkül, regex alapú
// Elegendő a strukturált XML feed-ek feldolgozásához

export interface FeedItem {
  title: string;
  link: string;
  snippet: string;
  publishedAt: Date | null;
}

export interface ParsedFeed {
  title: string;
  link: string;
  items: FeedItem[];
  isAtom: boolean;
}

// Egy XML tag értékét nyeri ki (első előfordulás)
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return stripCdata(m[1]).trim();
}

// CDATA kicsomagolás
function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// HTML tagek eltávolítása snippetből
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// Atom <link> tag: <link href="..."/> vagy <link>...</link>
function extractAtomLink(block: string): string {
  const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1].trim();
  return extractTag(block, 'link');
}

// ISO és RFC 822 dátum parse
function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// RSS 2.0 <item> blokkok kinyerése
function extractRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title   = stripHtml(extractTag(block, 'title'));
    const link    = extractTag(block, 'link') || extractTag(block, 'guid');
    const desc    = stripHtml(extractTag(block, 'description') || extractTag(block, 'content:encoded') || '');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    if (!link) continue;
    items.push({
      title,
      link,
      snippet: desc.slice(0, 500),
      publishedAt: parseDate(pubDate),
    });
  }
  return items;
}

// Atom <entry> blokkok kinyerése
function extractAtomEntries(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const title   = stripHtml(extractTag(block, 'title'));
    const link    = extractAtomLink(block);
    const summary = stripHtml(extractTag(block, 'summary') || extractTag(block, 'content') || '');
    const updated = extractTag(block, 'updated') || extractTag(block, 'published');
    if (!link) continue;
    items.push({
      title,
      link,
      snippet: summary.slice(0, 500),
      publishedAt: parseDate(updated),
    });
  }
  return items;
}

export function parseFeed(xml: string): ParsedFeed | null {
  if (!xml || xml.trim().length < 30) return null;

  const isAtom = /<feed[^>]*xmlns[^>]*>/i.test(xml) || /<entry[^>]*>/i.test(xml);

  const feedTitle = stripHtml(extractTag(xml, 'title') || '');
  const feedLink  = isAtom ? extractAtomLink(xml) : extractTag(xml, 'link');

  const items = isAtom ? extractAtomEntries(xml) : extractRssItems(xml);

  return { title: feedTitle, link: feedLink, items, isAtom };
}

// Felismeri-e a content-type vagy tartalom alapján, hogy RSS/Atom feed-e
export function isFeedContent(contentType: string, body: string): boolean {
  if (/xml|rss|atom/i.test(contentType)) return true;
  const start = body.slice(0, 500).toLowerCase();
  return start.includes('<rss') || start.includes('<feed') || start.includes('<?xml');
}
