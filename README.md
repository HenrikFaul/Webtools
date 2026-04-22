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
  - Manual / HAR / OpenAPI / repo-static ingestion
  - Manifest normalization
  - Sequential replay through diagnostics engine

## Run locally
```bash
npm install
npm run dev
```
