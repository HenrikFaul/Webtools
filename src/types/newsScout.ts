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

export interface SearchEngineKeyField {
  key: string;
  label: string;
  placeholder?: string;
}

export interface SearchEngineDefinition {
  id: string;
  label: string;
  description: string;
  keyFields: SearchEngineKeyField[];
}

export interface NewsScoutConfig {
  id: string;
  schedule_enabled: boolean;
  schedule_type: ScheduleType;
  schedule_value: number;
  search_engines: string[];
  lookback_days: number;
  webhook_url: string | null;
  notes: string | null;
  watchdog_timeout_minutes: number;
  max_concurrent_runs: number;
  api_keys: Record<string, string>;
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
  watchdog_timeout_minutes?: number;
  max_concurrent_runs?: number;
  api_keys?: Record<string, string>;
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
  last_heartbeat_at: string | null;
  progress_processed: number;
  progress_total: number;
  cancelled_at: string | null;
  error_message: string | null;
  created_at: string;
  duration_ms?: number | null;
  silent_minutes?: number | null;
}

export interface WatchdogResult {
  checked_at: string;
  active_runs_found: number;
  killed: Array<{ run_id: string; was_status: string; reason: string }>;
  timeout_minutes: number;
}

export interface ActiveRunsResponse {
  active_runs: Array<NewsScanRun & { silent_ms: number | null; silent_minutes: number | null }>;
  checked_at: string;
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
  feed_url: string | null;
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

export interface TestEngineResponse {
  ok: boolean;
  http_status: number;
  result_count: number;
  sample_url?: string;
  error?: string;
  endpoint_url?: string;
  endpoint_method?: string;
  query?: string;
}

export const SEARCH_ENGINES: SearchEngineDefinition[] = [
  {
    id: "google",
    label: "Google Custom Search API",
    description: "Google JSON API – API key + Custom Search Engine ID szükséges",
    keyFields: [
      { key: "google_api_key", label: "Google API Key", placeholder: "AIzaSy..." },
      { key: "google_cx", label: "Custom Search Engine ID (CX)", placeholder: "a1b2c3d4e5f6g7h8i" },
    ],
  },
  {
    id: "bing",
    label: "Bing Web Search API",
    description: "Microsoft Bing Search v7 – Ocp-Apim-Subscription-Key szükséges",
    keyFields: [
      { key: "bing_api_key", label: "Bing API Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
  },
  {
    id: "custom",
    label: "Saját keresőmotor (Custom HTTP)",
    description: "Saját endpoint GET/POST hívással – URL kötelező, API kulcs opcionális",
    keyFields: [
      { key: "custom_search_url", label: "Kereső endpoint URL", placeholder: "https://example.com/search" },
      { key: "custom_search_method", label: "HTTP metódus (GET|POST)", placeholder: "GET" },
      { key: "custom_search_api_key", label: "API kulcs (opcionális)", placeholder: "xxxxxxxx" },
      { key: "custom_search_api_key_header", label: "API kulcs header neve", placeholder: "Authorization" },
      { key: "custom_search_api_key_query_param", label: "API kulcs query param neve", placeholder: "api_key" },
    ],
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo (SearchAPI.io)",
    description: "SearchAPI.io DuckDuckGo engine – searchapi_key szükséges",
    keyFields: [
      { key: "searchapi_key", label: "SearchAPI.io API Key", placeholder: "searchapi_..." },
    ],
  },
  {
    id: "brave",
    label: "Brave Search API",
    description: "Független index – X-Subscription-Token szükséges",
    keyFields: [
      { key: "brave_api_key", label: "Brave API Key", placeholder: "BSA..." },
    ],
  },
  {
    id: "serper",
    label: "Serper.dev",
    description: "Google-alapú SERP API – X-API-KEY szükséges",
    keyFields: [
      { key: "serper_api_key", label: "Serper API Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
  },
  {
    id: "serpapi",
    label: "SerpAPI",
    description: "Universal SERP – api_key szükséges",
    keyFields: [
      { key: "serpapi_key", label: "SerpAPI Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
  },
];

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
