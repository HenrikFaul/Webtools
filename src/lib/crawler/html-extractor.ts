// HTML tartalom kinyerő — regex alapú, külső dependency nélkül

export interface ExtractedPage {
  title: string;
  snippet: string;
  feedUrls: string[];   // talált RSS/Atom feed URL-ek
  links: string[];      // oldalon belüli linkek
  publishedAt: Date | null;
}

// <title> kinyerése
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

// <meta name="description"> kinyerése
function extractMetaDescription(html: string): string {
  const patterns = [
    /<meta\s+name=["']description["'][^>]+content=["']([^"']{10,500})["']/i,
    /<meta\s+content=["']([^"']{10,500})["'][^>]+name=["']description["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

// <meta property="og:description"> kinyerése
function extractOgDescription(html: string): string {
  const m = html.match(/<meta\s+property=["']og:description["'][^>]+content=["']([^"']{10,500})["']/i);
  if (!m) return '';
  return m[1].trim();
}

// <article>, <main>, <div class="...content..."> szöveg kinyerése
function extractBodyText(html: string): string {
  // <head> eltávolítása
  const noHead = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  // script/style eltávolítása
  const noScript = noHead
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Próbálunk article/main blokkot kinyerni
  const articleMatch = noScript.match(/<(?:article|main)[^>]*>([\s\S]{100,}?)<\/(?:article|main)>/i);
  const source = articleMatch ? articleMatch[1] : noScript;

  // HTML tagek eltávolítása, whitespace normalizálása
  return source
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 800);
}

// RSS/Atom feed link-ek kinyerése <link rel="alternate"> tagekből
export function extractFeedUrls(html: string, baseUrl: string): string[] {
  const feeds: string[] = [];
  const re = /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      feeds.push(new URL(m[2], baseUrl).toString());
    } catch { /* skip invalid */ }
  }

  // Fordított attribútum sorrendű változat
  const re2 = /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(rss|atom)\+xml["']/gi;
  while ((m = re2.exec(html)) !== null) {
    try {
      feeds.push(new URL(m[1], baseUrl).toString());
    } catch { /* skip invalid */ }
  }

  return [...new Set(feeds)];
}

// <a href> linkek kinyerése
export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const re = /<a[^>]+href=["']([^"'#?][^"']*?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], baseUrl).toString();
      links.push(resolved);
    } catch { /* skip */ }
  }
  return [...new Set(links)];
}

// Publikálási dátum kinyerése meta tagekből
function extractPublishedAt(html: string): Date | null {
  const patterns = [
    /<meta[^>]+(?:name|property)=["'](?:article:published_time|publishedDate|date)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:article:published_time|publishedDate|date)["']/i,
    /(?:"datePublished"|"dateCreated")\s*:\s*"([^"]+)"/,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const title = extractTitle(html);
  const description = extractMetaDescription(html) || extractOgDescription(html);
  const bodyText = description || extractBodyText(html);

  return {
    title,
    snippet: bodyText.slice(0, 500),
    feedUrls: extractFeedUrls(html, baseUrl),
    links: extractLinks(html, baseUrl),
    publishedAt: extractPublishedAt(html),
  };
}
