# Webtools

Vercel-first Next.js workspace for **VibeCoding toolset**.

## Modules
- Dashboard shell (`/`)
- API Diagnostics Lab (`/tools/api-key-lab`)
  - Probe-based validation
  - Sequential batch mode
  - Supabase function inventory helper
- Request Trace Lab (`/tools/request-trace-lab`)
  - Hop-by-hop trace
  - Redirect visibility
  - Redacted request/response evidence
- Traffic Import & End-to-End Simulation Lab (`/tools/traffic-import-lab`)
  - Audit Workspace-style UI for live/source/import/demo flows
  - Runtime crawl URL analysis (`/api/crawl-traffic`)
  - Manual / HAR / OpenAPI / repo-static ingestion
  - Runtime-observed vs code-inferred separation
  - Manifest normalization
  - Chain replay + token injection
  - Sequential replay through diagnostics engine
  - Project-folder ingestion and onboarding/demo-oriented operator flow
- AI Semantic Branch Merger (`/tools/branch-merger`)
  - Client-side ZIP extraction and diff analysis via JSZip
  - Automatic main/feature branch detection
  - LLM-powered semantic file merging (OpenAI / Anthropic)
  - Regression-first merge policy (main branch priority)
  - Per-file progress tracking with stop control
  - Side-by-side diff viewer (main / feature / merged)
  - Client-side merged ZIP generation and download
  - Token estimation and large-file skip guard

## Environment Variables (Branch Merger)
- `OPENAI_API_KEY` — OpenAI API key for merge operations
- `ANTHROPIC_API_KEY` — Anthropic API key (alternative provider)
- `AI_MERGE_PROVIDER` — Force provider: `openai` or `anthropic`
- `OPENAI_MODEL` — Override model (default: `gpt-4o`)
- `ANTHROPIC_MODEL` — Override model (default: `claude-sonnet-4-20250514`)

## Run locally
```bash
npm install
npm run dev
```
