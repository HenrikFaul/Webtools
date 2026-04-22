# Operator Notes: Batch Mode

1. Open **API Diagnostics Lab**.
2. Configure shared connection details (mode, URL/base URL, headers, default body).
3. In the batch box, paste one of:
   - JSON array of rows,
   - one function name or URL per line,
   - pipe rows: `functionOrUrl|METHOD|BODY`.
4. Click **Run batch sequentially**.
5. Watch progress counter (`x / total`) and open each row for diagnosis summary + raw probe traces.
6. Use **Stop** to halt after current request; existing results remain visible.

## Request Trace Lab quick usage
1. Open **Request Trace Lab** from dashboard.
2. Paste full target URL and choose method.
3. Add optional headers/body.
4. Choose redirect mode and hop limit.
5. Run trace and inspect each hop card for status, location, headers, and body preview.

## Traffic Import Lab quick usage
1. Open **Traffic Import Lab**.
2. Choose import mode (`manual`, `har_import`, `openapi_import`, `runtime_browser`, or `repo_static`).
3. Paste source content and run import.
4. Review imported manifest entries and warnings.
5. Provide replay header name/value and run sequential replay.
6. Inspect per-entry verdicts and reasons in replay panel.
7. For live URL analysis, use the **Runtime crawl URL** field, then compare runtime-observed vs code-inferred sections.
8. Treat the audit-workspace style flows (live/source/import/demo) as guided operator patterns; keep source-folder ingestion and demo scenarios optional until fully productionized.
9. For local code analysis, prefer reviewed source uploads and chunked parsing; verify inferred endpoints before relying on them for replay.
