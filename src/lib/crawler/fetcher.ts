// HTTP fetcher rate limiting-gel és robots.txt figyelemmel
// Magyaroszági hírfelderítő crawler számára

const USER_AGENT = 'Mozilla/5.0 (compatible; HungarianNewsScout/1.0; +https://github.com/henrikfaul/webtools)';
const FETCH_TIMEOUT_MS = 8_000;   // Vercel serverless-barát timeout
const MIN_DELAY_MS = 300;          // serverless: kis delay, mert minden kérés új process

// Domain-szintű rate limit (memóriában — csak egy request-en belül)
const domainLastFetch: Map<string, number> = new Map();

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Késleltetés ha szükséges az adott domain-en
async function rateLimitDelay(domain: string): Promise<void> {
  const lastFetch = domainLastFetch.get(domain) ?? 0;
  const elapsed = Date.now() - lastFetch;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  domainLastFetch.set(domain, Date.now());
}

export interface FetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  error?: string;
  finalUrl: string;
}

export async function fetchUrl(url: string): Promise<FetchResult> {
  const domain = extractDomain(url);

  try {
    await rateLimitDelay(domain);

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.google.com/',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    const contentType = res.headers.get('content-type') ?? '';
    let body = '';

    try {
      body = await res.text();
    } catch {
      body = '';
    }

    return {
      ok: res.ok,
      status: res.status,
      contentType,
      body,
      finalUrl: res.url || url,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      body: '',
      error: err instanceof Error ? err.message : 'Fetch hiba',
      finalUrl: url,
    };
  }
}

// Robots.txt cache (futáson belüli)
const robotsCache: Map<string, string> = new Map();

async function fetchRobotsTxt(domain: string): Promise<string> {
  if (robotsCache.has(domain)) return robotsCache.get(domain)!;

  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });
    const text = res.ok ? await res.text() : '';
    robotsCache.set(domain, text);
    return text;
  } catch {
    robotsCache.set(domain, '');
    return '';
  }
}

// Egyszerű robots.txt parser — csak a mi user-agentünk és "*" szabályait nézi
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const domain = extractDomain(url);
  if (!domain) return false;

  const robotsTxt = await fetchRobotsTxt(domain);
  if (!robotsTxt) return true; // ha nem elérhető, assume OK

  try {
    const path = new URL(url).pathname;
    const lines = robotsTxt.split('\n').map((l) => l.trim());

    let inOurAgent = false;
    let inAnyAgent = false;
    const disallowedPaths: string[] = [];

    for (const line of lines) {
      if (line.toLowerCase().startsWith('user-agent:')) {
        const agent = line.slice(11).trim();
        inOurAgent = agent === '*' || agent.toLowerCase().includes('newsscout');
        inAnyAgent = agent === '*';
      } else if ((inOurAgent || inAnyAgent) && line.toLowerCase().startsWith('disallow:')) {
        const disallowed = line.slice(9).trim();
        if (disallowed) disallowedPaths.push(disallowed);
      }
    }

    return !disallowedPaths.some((dp) => path.startsWith(dp));
  } catch {
    return true;
  }
}
