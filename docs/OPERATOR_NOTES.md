 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/docs/OPERATOR_NOTES.md b/docs/OPERATOR_NOTES.md
new file mode 100644
index 0000000000000000000000000000000000000000..c1f63d555a3c9415a63066f0d9192423455bef35
--- /dev/null
+++ b/docs/OPERATOR_NOTES.md
@@ -0,0 +1,18 @@
+# Operator Notes: Batch Mode
+
+1. Open **API Diagnostics Lab**.
+2. Configure shared connection details (mode, URL/base URL, headers, default body).
+3. In the batch box, paste one of:
+   - JSON array of rows,
+   - one function name or URL per line,
+   - pipe rows: `functionOrUrl|METHOD|BODY`.
+4. Click **Run batch sequentially**.
+5. Watch progress counter (`x / total`) and open each row for diagnosis summary + raw probe traces.
+6. Use **Stop** to halt after current request; existing results remain visible.
+
+## Request Trace Lab quick usage
+1. Open **Request Trace Lab** from dashboard.
+2. Paste full target URL and choose method.
+3. Add optional headers/body.
+4. Choose redirect mode and hop limit.
+5. Run trace and inspect each hop card for status, location, headers, and body preview.
 
EOF
) 
