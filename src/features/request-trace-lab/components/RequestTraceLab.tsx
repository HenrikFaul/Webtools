"use client";

import { useState } from "react";
import type { TraceRequestPayload, TraceResponsePayload } from "@/types/requestTrace";

const DEFAULT_TRACE: TraceRequestPayload = {
  url: "",
  method: "GET",
  followRedirects: false,
  maxHops: 5,
  headersJson: "{}",
  body: ""
};

export function RequestTraceLab() {
  const [form, setForm] = useState<TraceRequestPayload>(DEFAULT_TRACE);
  const [result, setResult] = useState<TraceResponsePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTrace = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/trace-request", {
        method: "POST",
        headers: { "content-type": "application/json", "cache-control": "no-cache" },
        cache: "no-store",
        body: JSON.stringify(form)
      });
      const json = (await res.json()) as TraceResponsePayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Trace failed");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="row" style={{ gap: 16 }}>
      <div className="card row two">
        <label>Target URL
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://api.example.com/path" />
        </label>
        <label>Method
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
          </select>
        </label>
        <label>Headers JSON
          <textarea value={form.headersJson ?? ""} onChange={(e) => setForm({ ...form, headersJson: e.target.value })} placeholder='{"authorization":"Bearer ***"}' />
        </label>
        <label>Request body
          <textarea value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder='{"hello":"world"}' />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={Boolean(form.followRedirects)} onChange={(e) => setForm({ ...form, followRedirects: e.target.checked })} style={{ width: 16 }} /> Follow redirects automatically
        </label>
        <label>Max hops
          <input type="number" min={1} max={10} value={form.maxHops ?? 5} onChange={(e) => setForm({ ...form, maxHops: Number(e.target.value) })} />
        </label>
        <div style={{ gridColumn: "1 / -1" }} className="row two">
          <button onClick={() => void runTrace()} disabled={loading}>{loading ? "Tracing…" : "Run request trace"}</button>
          <button className="secondary" onClick={() => { setResult(null); setError(null); }}>Clear trace result</button>
        </div>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>Trace summary</h3>
        <p>{result?.summary ?? "Run trace to see hop-by-hop details."}</p>
        <div className="chips">
          <span className="chip">total: {result?.totalElapsedMs ?? 0} ms</span>
          <span className="chip">hops: {result?.hops?.length ?? 0}</span>
          <span className="chip">final: {result?.finalUrl ?? "n/a"}</span>
        </div>
      </div>

      <div className="card">
        <h3>Hop-by-hop evidence</h3>
        {(result?.hops ?? []).length ? (
          result?.hops.map((hop) => (
            <details key={hop.hop}>
              <summary>Hop {hop.hop} · {hop.status ?? "ERR"} · {hop.url}</summary>
              <div className="pre">{JSON.stringify(hop, null, 2)}</div>
            </details>
          ))
        ) : (
          <p className="muted">No hop data yet.</p>
        )}
      </div>
    </section>
  );
}
