export type NewsSourceType =
  | "municipality"
  | "police"
  | "healthcare"
  | "utility"
  | "gazette_legal"
  | "eu_funding"
  | "local_news"
  | "regional_news"
  | "authority"
  | "transport"
  | "disaster_management"
  | "education_public"
  | "other_public_interest";

export type NewsScanStatus = "ok" | "no_match" | "error" | "skipped";

export type ScheduleType = "minutes" | "hours" | "days";

export interface NewsScoutConfig {
  id: string;
  schedule_enabled: boolean;
  schedule_type: ScheduleType;
  schedule_value: number;
  search_engines: string[];
  lookback_days: number;
  webhook_url: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface NewsScoutConfigSaveRequest {
  schedule_enabled: boolean;
  schedule_type: ScheduleType;
  schedule_value: number;
  search_engines: string[];
  lookback_days: number;
  webhook_url?: string;
  notes?: string;
}

export interface NewsScanRun {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  scope_description: string | null;
  total_locations: number;
  total_known_sources_checked: number;
  total_new_sources_found: number;
  total_sources_with_matches: number;
  status: string;
  notes: string | null;
  trigger_type: string;
  created_at: string;
  duration_ms?: number;
}

export interface NewsScanRunsResponse {
  runs: NewsScanRun[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NewsSourceChannel {
  id: string;
  county_name: string | null;
  city: string;
  postcode: string;
  normalized_city: string | null;
  source_name: string | null;
  source_type: NewsSourceType;
  source_base_url: string;
  canonical_source_base_url: string;
  source_search_url: string | null;
  categories_supported: string[];
  discovery_method: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_match_at: string | null;
  active: boolean;
  confidence_score: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsSourceScanLog {
  id: string;
  run_id: string;
  scanned_at: string;
  county_name: string | null;
  city: string;
  postcode: string;
  source_channel_id: string | null;
  source_base_url: string;
  canonical_source_base_url: string | null;
  checked_for_last_30_days: boolean;
  had_match: boolean;
  matched_categories: string[];
  match_count_estimate: number | null;
  best_evidence_url: string | null;
  confidence_score: number;
  status: NewsScanStatus;
  error_message: string | null;
  created_at: string;
}

export interface LocationRegistryEntry {
  id: string;
  county_name: string | null;
  city: string;
  postcode: string;
  normalized_city: string | null;
  district_variant: string | null;
  search_aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface NewsScoutTablesQueryParams {
  table: "news_scan_runs" | "news_source_channels" | "news_source_scan_log" | "location_registry";
  page?: number;
  pageSize?: number;
  city?: string;
  postcode?: string;
  county?: string;
  status?: string;
  had_match?: string;
  active?: string;
}

export interface NewsScoutTablesResponse {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TriggerRunResponse {
  run_id: string;
  status: string;
  webhook_called: boolean;
  webhook_error?: string;
}

export interface MigrateCheckResponse {
  tables: Record<string, boolean>;
  all_ready: boolean;
  migration_sql_url: string;
}

export const SEARCH_ENGINES = [
  {
    id: "google",
    label: "Google Custom Search API",
    description: "Google JSON API – GOOGLE_API_KEY + GOOGLE_CX szükséges",
  },
  {
    id: "bing",
    label: "Bing Web Search API",
    description: "Microsoft Bing Search v7 – BING_SEARCH_API_KEY szükséges",
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    description: "Ingyenes, API kulcs nélkül, korlátozott kapacitás",
  },
  {
    id: "brave",
    label: "Brave Search API",
    description: "Független index – BRAVE_SEARCH_API_KEY szükséges",
  },
  {
    id: "serper",
    label: "Serper.dev",
    description: "Google-alapú SERP API – SERPER_API_KEY szükséges",
  },
  {
    id: "serpapi",
    label: "SerpAPI",
    description: "Universal SERP – SERPAPI_KEY szükséges",
  },
] as const;

export const SOURCE_TYPE_LABELS: Record<NewsSourceType, string> = {
  municipality: "Önkormányzat",
  police: "Rendőrség",
  healthcare: "Egészségügy",
  utility: "Közmű/közszolgáltató",
  gazette_legal: "Magyar Közlöny/jogi",
  eu_funding: "EU-s forrás/pályázat",
  local_news: "Helyi hírportál",
  regional_news: "Regionális hírportál",
  authority: "Hatóság",
  transport: "Közlekedés",
  disaster_management: "Katasztrófavédelem",
  education_public: "Oktatás/közintézmény",
  other_public_interest: "Egyéb közérdekű",
};
