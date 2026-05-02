// URL normalizáló és szűrő segédfüggvények

const HU_TLDS = ['.hu', '.gov.hu', '.org.hu', '.edu.hu', '.net.hu'];

// Meghatározza, hogy egy URL magyarországi vonatkozású-e
export function isHungarianUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return HU_TLDS.some((tld) => hostname.endsWith(tld));
  } catch {
    return false;
  }
}

// Canonical URL: scheme+host+path, query/fragment nélkül, trailing slash nélkül
export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Csak http/https
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    // Mindig https-re normalizálunk
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `https://${u.hostname}${path}`;
  } catch {
    return '';
  }
}

// Domain kinyerése URL-ből (www. nélkül)
export function extractDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Abszolút URL készítése relatív linkből
export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

// Szűrő: érdemes-e crawlolni ezt az URL-t?
export function shouldCrawl(url: string, parentDomain: string, depth: number, maxDepth: number): boolean {
  if (!url) return false;
  if (depth > maxDepth) return false;

  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

    // Kerüljük a nem-tartalmi fájlokat
    const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
    const skipExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar',
                      'jpg', 'jpeg', 'png', 'gif', 'svg', 'mp4', 'mp3',
                      'css', 'js', 'ico', 'woff', 'woff2', 'ttf'];
    if (skipExts.includes(ext)) return false;

    // Kerüljük a login, admin, API útvonalakat
    const skipPaths = ['/login', '/admin', '/wp-admin', '/api/', '/ajax/',
                       '/search?', '?s=', '#'];
    if (skipPaths.some((p) => u.pathname.includes(p) || url.includes(p))) return false;

    // Csak azonos domain-en belül (depth > 0 esetén)
    if (depth > 0) {
      const linkDomain = u.hostname.replace(/^www\./, '');
      if (linkDomain !== parentDomain) return false;
    }

    return true;
  } catch {
    return false;
  }
}

// RSS/Atom feed URL-t egyedi formára hozza
export function canonicalizeFeedUrl(url: string): string {
  return canonicalizeUrl(url);
}
