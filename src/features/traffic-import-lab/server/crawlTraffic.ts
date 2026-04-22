import { isBlockedNetworkTarget, redactHeaderValue, safeBodyPreview } from "@/lib/security";
import type { RequestManifestEntry } from "@/types/trafficImport";

interface CrawlResult {
  summary: string;
  entries: RequestManifestEntry[];
  warnings: string[];
}

const DEFAULT_WHITELIST = ["vercel.app", "localhost", "127.0.0.1"];

function isWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const envWhitelist = (process.env.CRAWL_DOMAIN_WHITELIST ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    const whitelist = envWhitelist.length ? envWhitelist : DEFAULT_WHITELIST;
    return whitelist.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function entryFromUrl(url: string, idx: number, source: string, status?: number): RequestManifestEntry {
  let path = "/";
  try { path = new URL(url).pathname; } catch {}
  return {
    id: `crawl-${idx}`,
    label: url,
    sourceMode: "runtime_browser",
    confidence: 0.7,
    resolvedUrl: url,
    pathTemplate: path,
    method: "GET",
    headersTemplate: {},
    queryTemplate: {},
    possibleEnvironmentVariables: [],
    callChain: [],
    observedStatuses: status ? [status] : [],
    responseShapeHints: [],
    sourceEvidence: [{ type: "runtime", detail: source }],
    needsReview: false,
    normalizationWarnings: [],
    runtimeObservedStatus: "observed",
    captureConfidence: "medium",
    specCoverageStatus: "unknown",
    browserContextRequiredStatus: "likely_required",
    clientWrapperMutationStatus: "unknown",
    authInjectionSourceStatus: "unknown",
    auditVerdict: "ok"
  };
}

export async function crawlTraffic(url: string): Promise<CrawlResult> {
  if (isBlockedNetworkTarget(url)) {
    return { summary: "Crawl blocked by SSRF guardrails.", entries: [], warnings: ["Target URL is private/localhost or invalid."] };
  }
  if (!isWhitelisted(url)) {
    return { summary: "Crawl blocked by domain whitelist policy.", entries: [], warnings: ["Add domain to CRAWL_DOMAIN_WHITELIST to allow crawling."] };
  }

  const warnings: string[] = [];
  const entries: RequestManifestEntry[] = [];

  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const map = new Map<string, RequestManifestEntry>();

    page.on("request", (req: { resourceType: () => string; method: () => string; url: () => string; headers: () => Record<string, string> }) => {
      if (!["xhr", "fetch", "websocket"].includes(req.resourceType())) return;
      const key = `${req.method()}-${req.url()}`;
      map.set(key, {
        ...entryFromUrl(req.url(), map.size + 1, "Captured by Playwright request event"),
        method: req.method(),
        headersTemplate: Object.fromEntries(Object.entries(req.headers()).map(([k, v]) => [k, redactHeaderValue(k, String(v))]))
      });
    });

    page.on("response", async (res: { request: () => { method: () => string }; url: () => string; status: () => number; text: () => Promise<string> }) => {
      const key = `${res.request().method()}-${res.url()}`;
      const current = map.get(key);
      if (!current) return;
      current.observedStatuses = [res.status()];
      const txt = safeBodyPreview(await res.text().catch(() => ""));
      if (txt) current.responseShapeHints = [txt.slice(0, 120)];
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await browser.close();
    entries.push(...Array.from(map.values()));

    return {
      summary: `Captured ${entries.length} runtime request(s).`,
      entries,
      warnings
    };
  } catch {
    warnings.push("Playwright runtime capture unavailable in this environment; fallback capture used.");
  }

  const response = await fetch(url, { cache: "no-store" });
  const html = await response.text();
  entries.push(entryFromUrl(url, 1, "Fallback document request", response.status));

  const matches = Array.from(new Set((html.match(/https?:\/\/[^\"'\s)]+/g) ?? []).filter((u) => u.includes("/api") || u.includes("/graphql"))));
  for (const [idx, found] of matches.entries()) {
    entries.push(entryFromUrl(found, idx + 2, "Fallback HTML URL extraction"));
  }

  return {
    summary: `Fallback crawl found ${entries.length} candidate request(s).`,
    entries,
    warnings
  };
}
