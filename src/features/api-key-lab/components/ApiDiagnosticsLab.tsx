"use client";

import { useMemo, useState } from "react";
import type { ValidateRequest, ValidateResponse } from "@/types/diagnostics";

const DEFAULT_REQ: ValidateRequest = {
  mode: "supabase-edge-function",
  baseUrl: "",
  functionPath: "",
  method: "POST",
  headerName: "apikey",
  headerValue: "",
  followRedirects: true,
  requestBody: "{}"
};

interface BatchRow {
  item: string;
  method: string;
  body?: string;
  result?: ValidateResponse;
  error?: string;
}

function parseBatchInput(input: string): BatchRow[] {
  const raw = input.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((row) => ({
          item: String(row.functionPath ?? row.targetUrl ?? row.url ?? row ?? "").trim(),
          method: String(row.method ?? "POST").toUpperCase(),
          body: row.body ? JSON.stringify(row.body) : undefined
        }));
      }
    } catch {
      return [];
    }
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("|")) {
        const [item, method, body] = line.split("|");
        return { item: item.trim(), method: (method || "POST").trim().toUpperCase(), body: body?.trim() };
      }
      return { item: line, method: "POST" };
    });
}

export function ApiDiagnosticsLab() {
  const [req, setReq] = useState<ValidateRequest>(DEFAULT_REQ);
  const [result, setResult] = useState<ValidateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchText, setBatchText] = useState("");
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [runningBatch, setRunningBatch] = useState(false);
  const [stopBatch, setStopBatch] = useState(false);

  const progress = useMemo(() => {
    const done = batchRows.filter((r) => r.result || r.error).length;
    return `${done} / ${batchRows.length}`;
  }, [batchRows]);

  const runSingle = async (payload: ValidateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as ValidateResponse;
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Validation failed");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runBatch = async () => {
    const parsed = parseBatchInput(batchText);
    setBatchRows(parsed);
    setRunningBatch(true);
    setStopBatch(false);

    for (let i = 0; i < parsed.length; i += 1) {
      if (stopBatch) break;
      const row = parsed[i];
      try {
        const payload: ValidateRequest = {
          ...req,
          method: row.method,
          functionPath: req.mode === "supabase-edge-function" ? row.item : req.functionPath,
          targetUrl: req.mode === "generic-header-check" ? row.item : req.targetUrl,
          requestBody: row.body ?? req.requestBody
        };
        const res = await fetch("/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = (await res.json()) as ValidateResponse;
        parsed[i] = { ...row, result: json, error: res.ok ? undefined : "Validation failed" };
      } catch (e) {
        parsed[i] = { ...row, error: e instanceof Error ? e.message : "Unexpected error" };
      }
      setBatchRows([...parsed]);
    }

    setRunningBatch(false);
  };

  return (
    <section className="row" style={{ gap: 16 }}>
      <div className="card row two">
        <label>Mode
          <select value={req.mode} onChange={(e) => setReq({ ...req, mode: e.target.value as ValidateRequest["mode"] })}>
            <option value="supabase-edge-function">supabase-edge-function</option>
            <option value="generic-header-check">generic-header-check</option>
          </select>
        </label>
        <label>Method
          <select value={req.method} onChange={(e) => setReq({ ...req, method: e.target.value })}>
            <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
          </select>
        </label>
        <label>Base URL
          <input value={req.baseUrl ?? ""} onChange={(e) => setReq({ ...req, baseUrl: e.target.value })} placeholder="https://project.supabase.co" />
        </label>
        <label>Function path or target URL
          <input value={req.mode === "supabase-edge-function" ? (req.functionPath ?? "") : (req.targetUrl ?? "")}
            onChange={(e) => setReq(req.mode === "supabase-edge-function" ? { ...req, functionPath: e.target.value } : { ...req, targetUrl: e.target.value })}
            placeholder="my-fn or https://api.example.com/path"
          />
        </label>
        <label>Header name
          <input value={req.headerName} onChange={(e) => setReq({ ...req, headerName: e.target.value })} />
        </label>
        <label>Header value
          <input value={req.headerValue} onChange={(e) => setReq({ ...req, headerValue: e.target.value })} />
        </label>
        <label>Extra headers JSON
          <textarea value={req.extraHeadersJson ?? ""} onChange={(e) => setReq({ ...req, extraHeadersJson: e.target.value })} placeholder='{"x-client":"vibecoding"}' />
        </label>
        <label>Request body
          <textarea value={req.requestBody ?? ""} onChange={(e) => setReq({ ...req, requestBody: e.target.value })} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={Boolean(req.duplicateBearerAuth)} onChange={(e) => setReq({ ...req, duplicateBearerAuth: e.target.checked })} style={{ width: 16 }} /> Duplicate bearer Authorization
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={Boolean(req.followRedirects)} onChange={(e) => setReq({ ...req, followRedirects: e.target.checked })} style={{ width: 16 }} /> Follow redirects
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button onClick={() => void runSingle(req)} disabled={loading}>{loading ? "Running…" : "Run diagnostics"}</button>
        </div>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>Verdict</h3>
        <div className="chips">
          <span className="chip">{result?.verdict ?? "not-run"}</span>
          <span className="chip">{result?.normalizedTarget ?? "No target yet"}</span>
        </div>
        <p>{result?.verdictReason ?? "Run a request to see diagnosis."}</p>
      </div>

      <div className="card">
        <h3>Diagnosis</h3>
        {result?.diagnosis ? (
          <>
            <div className="chips">
              <span className="chip">endpoint: {result.diagnosis.endpointExistence}</span>
              <span className="chip">auth: {result.diagnosis.authStatus}</span>
              <span className="chip">method: {result.diagnosis.methodStatus}</span>
              <span className="chip">payload: {result.diagnosis.payloadStatus}</span>
            </div>
            <p>{result.diagnosis.summary}</p>
            <details>
              <summary>Diagnosis steps</summary>
              <ul>{(result.diagnosis.steps ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          </>
        ) : (
          <p className="muted">No diagnosis block returned (older backend shape or failed request). UI fallback active.</p>
        )}
      </div>

      <div className="card">
        <h3>JWT / Key inspection</h3>
        <p>isJwt: {String(result?.keyInspection?.isJwt ?? false)}</p>
        <p>algorithm: {result?.keyInspection?.algorithm ?? "n/a"}</p>
        <div className="pre">{JSON.stringify(result?.keyInspection?.claims ?? {}, null, 2)}</div>
      </div>

      <div className="card">
        <h3>Raw evidence</h3>
        <details>
          <summary>Probe traces ({result?.probes?.length ?? 0})</summary>
          {(result?.probes ?? []).map((probe, idx) => (
            <div key={`${probe.label}-${idx}`} className="card" style={{ marginTop: 10 }}>
              <strong>{probe.label}</strong> · {probe.method} · {probe.status ?? "ERR"} · {probe.elapsedMs}ms
              <div className="pre">{JSON.stringify(probe, null, 2)}</div>
            </div>
          ))}
        </details>
      </div>

      <div className="card">
        <h3>Sequential batch validation</h3>
        <p className="muted">Input supports JSON array, line-separated names/URLs, or pipe rows (function|method|body).</p>
        <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} placeholder="users-sync|POST|{}" />
        <div className="row two" style={{ marginTop: 10 }}>
          <button onClick={() => void runBatch()} disabled={runningBatch}>{runningBatch ? `Running ${progress}` : "Run batch sequentially"}</button>
          <button className="secondary" onClick={() => setStopBatch(true)} disabled={!runningBatch}>Stop</button>
        </div>
        <p>Progress: {progress}</p>
        {(batchRows ?? []).map((row, idx) => (
          <details key={`${row.item}-${idx}`} style={{ marginBottom: 8 }}>
            <summary>{idx + 1}. {row.item} · {row.method} · {row.result?.verdict ?? row.error ?? "pending"}</summary>
            <p>{row.result?.diagnosis?.summary ?? row.result?.verdictReason ?? row.error ?? "Not run"}</p>
            <div className="pre">{JSON.stringify(row.result?.probes ?? [], null, 2)}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
