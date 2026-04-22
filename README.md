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
  - Runtime crawl URL analysis (`/api/crawl-traffic`)
  - Manual / HAR / OpenAPI / repo-static ingestion
  - Runtime-observed vs code-inferred separation
  - Chain replay + token injection

## Run locally
```bash
npm install
npm run dev
```
