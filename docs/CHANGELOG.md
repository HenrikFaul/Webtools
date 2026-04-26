# Changelog

## 2026-04-21
- Initialized `VibeCoding toolset` modular shell with root dashboard and tool registry.
- Added `API Diagnostics Lab` route and UI with defensive rendering for partial backend responses.
- Implemented `/api/validate-key` with Supabase-target normalization, SSRF blocking, request redaction, timeout caps, and probe-based diagnosis.
- Added sequential batch validator (JSON / line / pipe formats), stop control, progress, and per-item trace rendering.
- Added typed diagnostics contracts to enable future-versioned response evolution.
- Captured operator usage instructions for batch mode in `docs/OPERATOR_NOTES.md`.

## Lessons learned
- Previous regression pattern (`undefined.summary`) is mitigated by strict optional chaining and explicit fallback states.
- Backward-compatible response rendering is now treated as a first-class acceptance criterion.

## 2026-04-21 (round 2)
- Fixed auth diagnosis reliability by adding explicit with-auth vs no-auth probe comparison for Supabase checks.
- Added `cache: no-store` on probe execution and client validation requests to avoid stale-result perception.
- Added `Clear test results` action for clean reruns.
- Added single-URL mode for easy copy/paste Supabase invoke URLs.
- Added Supabase function inventory API + UI section with function list, invoke paths, method hints, and heuristic request/response examples.

## 2026-04-22
- Implemented Request Trace Lab module with dedicated UI route `/tools/request-trace-lab`.
- Added `/api/trace-request` backend with hop-by-hop trace collection, redirect handling, SSRF guardrails, timeout controls, and redacted header previews.
- Updated tool registry to expose Request Trace Lab as a ready module from the dashboard.

## 2026-04-22 (traffic import lab)
- Added Traffic Import & End-to-End Simulation Lab route and UI workspace.
- Added traffic import APIs (`/api/traffic-import`, `/api/repo-analyze`, `/api/manifest-replay`) and feature-local server modules.
- Added normalized traffic manifest data model with evidence and uncertainty fields.
- Added sequential manifest replay bridge into existing diagnostics engine.
- Enhanced Traffic Import Lab with live URL crawl route (`/api/crawl-traffic`) and runtime_browser integration.
- Upgraded repo analyzer with deeper static heuristics (env vars, axios.create, SWR, TanStack Query patterns).
- Upgraded replay engine with chain mode + token injection and template substitution from previous results.
- Added audit verdict surfacing and explicit runtime-observed vs code-inferred panels in Traffic Import UI.
- Reworked Traffic Import Lab messaging toward an audit-workspace style experience with clearer live/source/import/demo guidance.
- Reworked Traffic Import Lab into an interactive Audit Workspace with tabbed Live/Source/Import/Demo flows and clearer source-selection guidance.
- Added project folder ingestion UX (webkitdirectory), chunked client-side file reading, and source file preview list.
- Added built-in one-click demo scenarios (OpenWeatherMap, JSONPlaceholder, DummyJSON Auth) and onboarding guide panel.
- Added deep replay verdict panel with status code and response preview rendering.
- Added crawl whitelist policy (`CRAWL_DOMAIN_WHITELIST`) for safer runtime auditing.
- Made Audit Workspace affordances explicitly visible in UI copy so operators can understand Live / Source / Import / Demo paths faster.

## 2026-04-26 (AI Semantic Branch Merger)
- Added AI Semantic Branch Merger module with dedicated UI route `/tools/branch-merger`.
- Added `jszip` dependency for client-side ZIP processing (extraction and repackaging).
- Implemented client-side ZIP extraction with automatic main/feature branch detection via top-level folder heuristics.
- Implemented client-side diff analysis: identifies modified, unchanged, main-only, and feature-only files between two branches.
- Added text file extension whitelist for safe extraction (skips binary files).
- Added estimated token calculation per file pair (~4 chars/token) with MAX_TOKENS_PER_FILE guard (28k tokens).
- Created `/api/ai-merge` Vercel Serverless Function supporting both OpenAI and Anthropic LLM providers.
- AI merge system prompt enforces main-branch-first priority, regression prevention, and clean code-only output.
- Added provider auto-detection from environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, AI_MERGE_PROVIDER).
- Added client-side API key passthrough option for users without server-side env vars configured.
- Implemented sequential file-by-file merge with progress bar, stop control, and per-file status tracking.
- Added file detail panel with side-by-side view of main/feature/merged versions.
- Implemented client-side merged ZIP generation and download with merged files replacing originals, feature-only files included, and main-only files preserved.
- Added drag-and-drop upload zone with visual feedback.
- Added Hungarian-language UI copy and onboarding guide.
- Added types in `src/types/branchMerger.ts` with full type coverage.
- Updated tool registry to include Branch Merger as a ready module.

## 2026-04-26 (GeoData self-healing local ETL)
- Added robust `unified_pois` → `local_pois` ETL endpoint at `/api/geodata/load-local`.
- Added per-run UUID `load_session_id` handling through the target-side `last_load_session` field.
- Implemented batch UPSERT with `ON CONFLICT (provider_id, source_provider)` semantics through Supabase upsert.
- Added post-load verification loop comparing source expected count to target `last_load_session` count.
- Added missing-record delta retry logic with a maximum retry guard and explicit retry logs.
- Added failure-only behavior for mismatched counts: the endpoint returns `SUCCESS` only when expected and found counts match exactly.
- Added local ETL UI step with orange/running, green/success, red/failure status lamp and detailed retry logs.
- Added `local_pois` review support and local count in the GeoData stats panel.
- Added idempotent Supabase SQL migration for `local_pois` session tracking, unique conflict key, and verification indexes.

## v4.1.4 — POI ETL schema alignment and database-side merge hardening

- Replaced the fragile JavaScript row-by-row provider merge with the PostgreSQL RPC `public.merge_provider_pois_to_unified(...)`.
- Added canonical schema hardening for `unified_pois` and `local_pois`, including explicit type normalization for text, jsonb, boolean, numeric and timestamp columns.
- Added safe SQL cast helpers so provider source rows can be mapped without `COALESCE text/jsonb` failures.
- Added schema audit views:
  - `public.poi_etl_schema_audit`
  - `public.poi_table_column_types`
- Hardened the GeoData frontend merge result rendering so an API/database failure cannot crash the whole page through `undefined.length`.
- The merge endpoint now always returns a structured JSON result with `status`, `errors`, `merge_logs`, counts and session id.

Validation SQL after migration:

```sql
select * from public.poi_etl_schema_audit where not unified_ok or not local_ok;
select table_name, column_name, data_type, character_maximum_length
from public.poi_table_column_types
where table_name in ('geoapify_pois','tomtom_pois','unified_pois','local_pois')
order by table_name, ordinal_position;
```

## v4.1.5 - POI schema migration default-cast recovery

- Fixed Supabase migration failure `default for column "categories" cannot be cast automatically to type jsonb`.
- Root cause: legacy `unified_pois` / `local_pois` columns could have old text defaults while v4.1.4 tried to change those columns to canonical jsonb/boolean/numeric/timestamp types.
- Added a pre-normalization default-drop block for only the columns whose types are changed; canonical defaults are re-applied after conversion.
- Dropped POI audit views before column type normalization to avoid dependency failures on repeated migration runs.
- Re-applied `id default gen_random_uuid()` explicitly after normalization as a safety guard.
- Outcome: `public.poi_etl_schema_audit` and `public.poi_table_column_types` are created only after the schema conversion succeeds, so the audit query is meaningful and repeatable.
- Corrected `poi_etl_schema_audit` so it compares equivalent target fields only: `unified_pois.source_id` ↔ `local_pois.provider_id`, `unified_at` ↔ `source_unified_at`, `last_merge_session` ↔ `last_load_session`, and `last_merged_at` ↔ `last_loaded_at`.

## v4.1.6 - POI merge timeout fix with chunked reset+insert

- Replaced the long single-statement provider merge call with a chunked database workflow:
  - `reset_provider_pois_to_unified_merge(...)`
  - `insert_provider_pois_to_unified_chunk(...)`
  - `finish_provider_pois_to_unified_merge(...)`
- Root cause fixed: the previous database-side merge still executed one large `UPDATE` + `INSERT` statement through a single RPC call, which could hit Supabase/PostgreSQL `statement timeout` before 50k+ Geoapify rows finished.
- The merge now clears the selected provider/country scope first, then inserts raw provider rows into `unified_pois` in deterministic `source_id` cursor chunks.
- Added provider source indexes on `(external_id)` and `(country_code, external_id)` to make cursor chunking and count verification predictable.
- The Next.js merge route now orchestrates small RPC chunks instead of asking PostgreSQL/PostgREST to complete the whole transfer in one statement.
- Final success is still strict: `count(distinct raw.external_id)` must equal `count(distinct unified_pois.source_id)` for the current `last_merge_session`.
- This intentionally avoids mixed-type `COALESCE`, legacy duplicate update joins, and long-running single-statement merge behavior.
