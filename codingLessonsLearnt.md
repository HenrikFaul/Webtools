# Coding Lessons Learnt

## 2026-04-21
- Symptom: Users can think API key checks are "cached" when previous successful output remains visible.
- Root cause: Missing explicit clear/reset action and weak auth-differential probing logic.
- Fix: Added a dedicated result reset CTA, no-store request options, and explicit auth/no-auth probe comparison for Supabase mode.
- Prevention: Always include a clean-state action for diagnostics tools and compare auth/no-auth probes before marking auth as valid.

## 2026-04-22
- New module additions should be shipped as isolated feature folders with their own API route and component boundary to avoid cross-tool coupling regressions.
