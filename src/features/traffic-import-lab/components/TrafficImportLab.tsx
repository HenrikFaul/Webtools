"use client";

import { useMemo, useState } from "react";
import type { ManifestReplayResponse, RequestManifestEntry, TrafficImportRequest, TrafficImportResponse, TrafficSourceMode } from "@/types/trafficImport";

const MODES: TrafficSourceMode[] = ["manual", "har_import", "openapi_import", "runtime_browser", "repo_static"];

export function TrafficImportLab() {
  const [mode, setMode] = useState<TrafficSourceMode>("manual");
  const [rawInput, setRawInput] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [importResult, setImportResult] = useState<TrafficImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [headerName, setHeaderName] = useState("apikey");
  const [headerValue, setHeaderValue] = useState("");
  const [replayResult, setReplayResult] = useState<ManifestReplayResponse | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  const entries: RequestManifestEntry[] = useMemo(() => importResult?.entries ?? [], [importResult]);

  const runImport = async () => {
    setLoading(true);
    setImportError(null);
    setReplayResult(null);
    try {
      if (mode === "repo_static") {
        const repoRes = await fetch("/api/repo-analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rawInput })
        });
        const repoJson = (await repoRes.json()) as { entries?: RequestManifestEntry[]; error?: string };
        if (!repoRes.ok) throw new Error(repoJson.error ?? "Repo analysis failed");
        setImportResult({
          summary: `Imported ${repoJson.entries?.length ?? 0} static request candidate(s).`,
          entries: repoJson.entries ?? [],
          warnings: ["Repo static mode is inference-only; wrappers/interceptors may alter runtime request shape."]
        });
      } else {
        const payload: TrafficImportRequest = { mode, rawInput, baseUrl };
        const res = await fetch("/api/traffic-import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = (await res.json()) as TrafficImportResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Import failed");
        setImportResult(json);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unexpected import error");
      setImportResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runReplay = async () => {
    setReplayLoading(true);
    try {
      const res = await fetch("/api/manifest-replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries, headerName, headerValue })
      });
      const json = (await res.json()) as ManifestReplayResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Replay failed");
      setReplayResult(json);
    } catch {
      setReplayResult({ summary: "Replay failed", results: [] });
    } finally {
      setReplayLoading(false);
    }
  };

  return (
    <section className="row" style={{ gap: 16 }}>
      <div className="card row two">
        <label>Import mode
          <select value={mode} onChange={(e) => setMode(e.target.value as TrafficSourceMode)}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>Base URL (optional)
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>Raw import input
          <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder="GET https://api.example.com/users" />
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button onClick={() => void runImport()} disabled={loading}>{loading ? "Importing…" : "Import traffic into manifest"}</button>
        </div>
      </div>

      <div className="card">
        <h3>Capture summary</h3>
        <p>{importResult?.summary ?? "No imported manifest yet."}</p>
        {(importResult?.warnings ?? []).map((warning, idx) => <p className="muted" key={idx}>• {warning}</p>)}
        {importError ? <p>{importError}</p> : null}
      </div>

      <div className="card">
        <h3>Imported request inventory</h3>
        {(entries ?? []).length ? entries.map((entry) => (
          <details key={entry.id}>
            <summary>{entry.method} {entry.pathTemplate} · {entry.sourceMode} · confidence {entry.confidence}</summary>
            <div className="pre">{JSON.stringify(entry, null, 2)}</div>
          </details>
        )) : <p className="muted">No request entries yet.</p>}
      </div>

      <div className="card row two">
        <label>Replay header name
          <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
        </label>
        <label>Replay header value
          <input value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} />
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button onClick={() => void runReplay()} disabled={replayLoading || entries.length === 0}>{replayLoading ? "Replaying…" : "Replay imported manifest sequentially"}</button>
        </div>
      </div>

      <div className="card">
        <h3>Replay & diagnosis panel</h3>
        <p>{replayResult?.summary ?? "No replay run yet."}</p>
        {(replayResult?.results ?? []).map((item) => (
          <div key={item.id} className="card" style={{ marginTop: 8 }}>
            <strong>{item.label}</strong>
            <div className="chips">
              <span className="chip">{item.verdict}</span>
              <span className="chip">{item.url}</span>
            </div>
            <p>{item.verdictReason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
