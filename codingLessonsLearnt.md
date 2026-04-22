+# Changelog
+
+## 2026-04-21
+- Initialized `VibeCoding toolset` modular shell with root dashboard and tool registry.
+- Added `API Diagnostics Lab` route and UI with defensive rendering for partial backend responses.
+- Implemented `/api/validate-key` with Supabase-target normalization, SSRF blocking, request redaction, timeout caps, and probe-based diagnosis.
+- Added sequential batch validator (JSON / line / pipe formats), stop control, progress, and per-item trace rendering.
+- Added typed diagnostics contracts to enable future-versioned response evolution.
+- Captured operator usage instructions for batch mode in `docs/OPERATOR_NOTES.md`.
+
+## Lessons learned
+- Previous regression pattern (`undefined.summary`) is mitigated by strict optional chaining and explicit fallback states.
+- Backward-compatible response rendering is now treated as a first-class acceptance criterion.
+
+## 2026-04-21 (round 2)
+- Fixed auth diagnosis reliability by adding explicit with-auth vs no-auth probe comparison for Supabase checks.
+- Added `cache: no-store` on probe execution and client validation requests to avoid stale-result perception.
+- Added `Clear test results` action for clean reruns.
+- Added single-URL mode for easy copy/paste Supabase invoke URLs.
+- Added Supabase function inventory API + UI section with function list, invoke paths, method hints, and heuristic request/response examples.
+- Symptom: Users can think API key checks are "cached" when previous successful output remains visible.
+- Root cause: Missing explicit clear/reset action and weak auth-differential probing logic.
+- Fix: Added a dedicated result reset CTA, no-store request options, and explicit auth/no-auth probe comparison for Supabase mode.
+- Prevention: Always include a clean-state action for diagnostics tools and compare auth/no-auth probes before marking auth as valid.
+## 2026-04-22
+- Implemented Request Trace Lab module with dedicated UI route `/tools/request-trace-lab`.
+- Added `/api/trace-request` backend with hop-by-hop trace collection, redirect handling, SSRF guardrails, timeout controls, and redacted header previews.
+- Updated tool registry to expose Request Trace Lab as a ready module from the dashboard.
+- New module additions should be shipped as isolated feature folders with their own API route and component boundary to avoid cross-tool coupling regressions.
