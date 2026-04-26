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
