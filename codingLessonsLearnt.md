# Coding Lessons Learnt

## 2026-04-21 — baseline module learnings
- Initialized `VibeCoding toolset` modular shell with root dashboard and tool registry.
- Added `API Diagnostics Lab` route and UI with defensive rendering for partial backend responses.
- Implemented `/api/validate-key` with Supabase-target normalization, SSRF blocking, request redaction, timeout caps, and probe-based diagnosis.
- Added sequential batch validator (JSON / line / pipe formats), stop control, progress, and per-item trace rendering.
- Added typed diagnostics contracts to enable future-versioned response evolution.
- Captured operator usage instructions for batch mode in `docs/OPERATOR_NOTES.md`.

## 2026-04-21 — reliability lessons
- Previous regression pattern (`undefined.summary`) is mitigated by strict optional chaining and explicit fallback states.
- Backward-compatible response rendering is now treated as a first-class acceptance criterion.
- Symptom: Users can think API key checks are "cached" when previous successful output remains visible.
- Root cause: Missing explicit clear/reset action and weak auth-differential probing logic.
- Fix: Added a dedicated result reset CTA, no-store request options, and explicit auth/no-auth probe comparison for Supabase mode.
- Prevention: Always include a clean-state action for diagnostics tools and compare auth/no-auth probes before marking auth as valid.

## 2026-04-21 — round 2 implementation lessons
- Fixed auth diagnosis reliability by adding explicit with-auth vs no-auth probe comparison for Supabase checks.
- Added `cache: no-store` on probe execution and client validation requests to avoid stale-result perception.
- Added `Clear test results` action for clean reruns.
- Added single-URL mode for easy copy/paste Supabase invoke URLs.
- Added Supabase function inventory API + UI section with function list, invoke paths, method hints, and heuristic request/response examples.

## 2026-04-22
- Implemented Request Trace Lab module with dedicated UI route `/tools/request-trace-lab`.
- Added `/api/trace-request` backend with hop-by-hop trace collection, redirect handling, SSRF guardrails, timeout controls, and redacted header previews.
- Updated tool registry to expose Request Trace Lab as a ready module from the dashboard.
- New module additions should be shipped as isolated feature folders with their own API route and component boundary to avoid cross-tool coupling regressions.

## 2026-04-22 — traffic import
- Hybrid import systems must preserve uncertainty fields (`needsReview`, confidence, source evidence) instead of pretending static/runtime inference is definitive.
- Regex-only static analysis misses wrapper-driven and env-derived endpoints; keep uncertainty but enrich with multi-pattern heuristics and review flags.
- Runtime-observed and code-inferred entries should be shown separately in the UI to make review effort explicit.
- Replay flows that depend on prior responses need lightweight chain support and token injection rather than only flat sequential replay.
- Empty-state onboarding and concrete demo scenarios materially reduce setup friction compared to bare technical forms in diagnostics tools.
- Crawl/runtime auditing needs domain-scoping safeguards so live URL analysis cannot drift into uncontrolled cross-domain inspection.
- Audit-workspace style flows should make the available Live / Source / Import / Demo paths explicit in the UI, not only implied by internal component structure.

## 2026-04-26 — branch merger lessons
- Client-side ZIP processing via JSZip avoids Vercel serverless function body size limits entirely; file content never traverses the network except for the specific diff pairs sent to the LLM.
- Dynamic `import("jszip")` is required to avoid SSR errors; the ref must store the constructor directly, not the module namespace, because CJS/ESM default export shapes differ.
- Token estimation (chars / 4) is deliberately conservative; real tokenizer counts vary but overestimating is safer than sending files the LLM will truncate.
- The AI merge system prompt must explicitly forbid markdown fences in output; LLMs add them reflexively even when told not to. A post-processing strip step is essential.
- Supporting both OpenAI and Anthropic from a single API route via env-var detection means the merge feature works with whichever provider the deployer already has credentials for.
- Sequential file-by-file merge (not batch) is intentional: it allows per-file progress UI, stop/resume control, and avoids overloading a single LLM context window.
- Binary file detection by extension whitelist is more reliable than content-sniffing in a browser ZIP extraction context.

## 2026-04-26 — GeoData self-healing ETL lessons
- High-volume provider-to-local loads must not be marked successful based only on completed API calls or successful insert batches.
- Every ETL run needs a dedicated session identifier stored on each affected target row, otherwise old target rows can hide current-run data loss.
- Existing POIs must be updated during UPSERT, not skipped, because their `last_load_session` has to move to the current run for validation.
- A green UI state is only valid after source expected count equals the target count filtered by the current `last_load_session`.
- Retry logic should be delta-based: identify missing provider/source keys and retry only those rows, with a hard maximum retry guard.
- Duplicate source keys make exact source-row-to-target-row parity impossible under `(provider_id, source_provider)` uniqueness and must fail loudly.
- Schema support belongs in an idempotent migration: add `last_load_session`, the provider/source unique index, and verification indexes without deleting existing data.

## v4.1.3 - Lesson: avoid mixed text/jsonb COALESCE in database-side ETL

The provider-to-unified POI merge must not rely on JavaScript/PostgREST loops for 50k+ records, and PostgreSQL-side ETL must be explicit about column types. A production failure occurred because a merge function tried to `COALESCE` values where one side was `text` and the other side was `jsonb`. PostgreSQL correctly rejected that expression before any rows could be merged.

Correction: the merge RPC now casts text fields as text and json fields as jsonb separately. `opening_hours` is handled as text in `unified_pois`, while `categories`, `diet`, `payment_options`, `name_international`, and `raw_data` remain jsonb. The route only calls the RPC and normalizes the structured JSON response. The success condition is exact source-to-target parity by `last_merge_session`.
