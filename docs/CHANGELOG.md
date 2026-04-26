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
