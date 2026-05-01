export interface ToolRegistryItem {
  slug: string;
  title: string;
  description: string;
  href: string;
  status: "ready" | "planned";
}

export const TOOL_REGISTRY: ToolRegistryItem[] = [
  {
    slug: "api-key-lab",
    title: "API Diagnostics Lab",
    description: "Probe-driven key, endpoint, method, and payload diagnostics with trace evidence.",
    href: "/tools/api-key-lab",
    status: "ready"
  },
  {
    slug: "request-trace-lab",
    title: "Request Trace Lab",
    description: "Hop-by-hop request tracing with redirect transparency and redacted evidence cards.",
    href: "/tools/request-trace-lab",
    status: "ready"
  },
  {
    slug: "traffic-import-lab",
    title: "Traffic Import Lab",
    description: "Hybrid traffic import, manifest normalization, replay, and diagnosis workspace.",
    href: "/tools/traffic-import-lab",
    status: "ready"
  },
  {
    slug: "branch-merger",
    title: "AI Semantic Branch Merger",
    description: "Intelligens kód-összefésülő: ZIP feltöltés, diff analízis, LLM-alapú regressziómentes merge, és letölthető eredmény.",
    href: "/tools/branch-merger",
    status: "ready"
  },
  {
    slug: "geodata",
    title: "GeoData – POI Címadatbázis",
    description: "Turisztikai POI-k beszerzése Geoapify és TomTom API-ról, ország+kategória szűréssel, ellenőrzéssel, és egyesített címtáblába töltéssel.",
    href: "/tools/geodata",
    status: "ready"
  },
  {
    slug: "news-scout",
    title: "Hírfelderítő Motor",
    description: "Magyarországi közérdekű hírforrás-csatornák folyamatos felfedezése és naplózása – settlement-szintű forrásregiszter, keresőmotor-konfiguráció, ütemezés és futásnapló.",
    href: "/tools/news-scout",
    status: "ready"
  }
];
