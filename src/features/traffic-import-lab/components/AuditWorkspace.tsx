"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ManifestReplayResponse, RequestManifestEntry, TrafficImportResponse, TrafficSourceMode } from "@/types/trafficImport";

type WorkspaceTab = "live" | "source" | "import" | "demo";

interface DemoScenario {
  name: string;
  notes: string;
  entries: RequestManifestEntry[];
}

const DEMOS: DemoScenario[] = [
  {
    name: "OpenWeatherMap",
    notes: "Query param API key demo.",
    entries: [{
      id: "demo-weather",
      label: "OpenWeatherMap weather",
      sourceMode: "manual",
      confidence: 1,
      resolvedUrl: "https://api.openweathermap.org/data/2.5/weather?q=Budapest&appid=b6907d289e10d714a6e88b30761fae22",
      pathTemplate: "/data/2.5/weather",
      method: "GET",
      headersTemplate: {},
      queryTemplate: { q: "Budapest", appid: "b6907d289e10d714a6e88b30761fae22" },
      possibleEnvironmentVariables: [],
      callChain: [],
      observedStatuses: [],
      responseShapeHints: [],
      sourceEvidence: [{ type: "manual", detail: "Built-in demo" }],
      needsReview: false,
      normalizationWarnings: [],
      runtimeObservedStatus: "unknown",
      captureConfidence: "high",
      specCoverageStatus: "unknown",
      browserContextRequiredStatus: "not_required",
      clientWrapperMutationStatus: "not_detected",
      authInjectionSourceStatus: "query",
      auditVerdict: "ok"
    }]
  },
  {
    name: "JSONPlaceholder POST",
    notes: "Payload + custom header demo.",
    entries: [{
      id: "demo-jsonplaceholder",
      label: "JSONPlaceholder create post",
      sourceMode: "manual",
      confidence: 1,
      resolvedUrl: "https://jsonplaceholder.typicode.com/posts",
      pathTemplate: "/posts",
      method: "POST",
      headersTemplate: { "x-demo": "vibecoding" },
      queryTemplate: {},
      bodyTemplate: '{"title":"foo","body":"bar"}',
      possibleEnvironmentVariables: [],
      callChain: [],
      observedStatuses: [],
      responseShapeHints: [],
      sourceEvidence: [{ type: "manual", detail: "Built-in demo" }],
      needsReview: false,
      normalizationWarnings: [],
      runtimeObservedStatus: "unknown",
      captureConfidence: "high",
      specCoverageStatus: "unknown",
      browserContextRequiredStatus: "not_required",
      clientWrapperMutationStatus: "not_detected",
      authInjectionSourceStatus: "header",
      auditVerdict: "ok"
    }]
  },
  {
    name: "DummyJSON Auth",
    notes: "Successful vs failed auth flow demo target.",
    entries: [{
      id: "demo-dummy-auth",
      label: "DummyJSON login",
      sourceMode: "manual",
      confidence: 1,
      resolvedUrl: "https://dummyjson.com/auth/login",
      pathTemplate: "/auth/login",
      method: "POST",
      headersTemplate: { "content-type": "application/json" },
      queryTemplate: {},
      bodyTemplate: '{"username":"kminchelle","password":"0lel09el"}',
      possibleEnvironmentVariables: [],
      callChain: [],
      observedStatuses: [],
      responseShapeHints: [],
      sourceEvidence: [{ type: "manual", detail: "Built-in demo" }],
      needsReview: false,
      normalizationWarnings: [],
      runtimeObservedStatus: "unknown",
      captureConfidence: "high",
      specCoverageStatus: "unknown",
      browserContextRequiredStatus: "not_required",
      clientWrapperMutationStatus: "not_detected",
      authInjectionSourceStatus: "header",
      auditVerdict: "ok"
    }]
  }
];

export function AuditWorkspace() {
  const [tab, setTab] = useState<WorkspaceTab>("live");
  const [mode, setMode] = useState<TrafficSourceMode>("manual");
  const [rawInput, setRawInput] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<TrafficImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [headerName, setHeaderName] = useState("apikey");
  const [headerValue, setHeaderValue] = useState("");
  const [tokenInjection, setTokenInjection] = useState("");
  const [chainMode, setChainMode] = useState(true);
  const [replayResult, setReplayResult] = useState<ManifestReplayResponse | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo(() => importResult?.entries ?? [], [importResult]);
  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("webkitdirectory", "");
      fileInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const runtimeEntries = entries.filter((e) => e.runtimeObservedStatus === "observed");
  const inferredEntries = entries.filter((e) => e.runtimeObservedStatus !== "observed");

  const runCrawl = async () => {
    setLoading(true);
    setImportError(null);
    try {
      const res = await fetch("/api/crawl-traffic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: crawlUrl }) });
      const json = (await res.json()) as TrafficImportResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Crawl failed");
      setImportResult(json);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unexpected crawl error");
      setImportResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    setLoading(true);
    setImportError(null);
    try {
      const res = await fetch("/api/traffic-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, rawInput, baseUrl })
      });
      const json = (await res.json()) as TrafficImportResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setImportResult(json);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unexpected import error");
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
        body: JSON.stringify({ entries, headerName, headerValue, chainMode, tokenInjection })
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

  const runSourceAnalysis = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    setImportError(null);
    const selected = Array.from(files).filter((f) => /\.(ts|tsx|js|jsx|env)$/i.test(f.name));
    setSourceFiles(selected.map((f) => f.webkitRelativePath || f.name));

    const chunks: string[] = [];
    for (let i = 0; i < selected.length; i += 20) {
      const part = selected.slice(i, i + 20);
      const texts = await Promise.all(part.map((file) => file.text().catch(() => "")));
      chunks.push(texts.join("\n"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    try {
      const res = await fetch("/api/repo-analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawInput: chunks.join("\n") })
      });
      const json = (await res.json()) as { entries?: RequestManifestEntry[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Source analysis failed");
      setImportResult({ summary: `Analyzed ${selected.length} files and inferred ${json.entries?.length ?? 0} request candidates.`, entries: json.entries ?? [], warnings: ["Uncertain entries remain marked needsReview."] });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unexpected source analysis error");
    } finally {
      setLoading(false);
    }
  };

  const loadDemo = (demo: DemoScenario) => {
    setImportResult({ summary: `${demo.name} demo loaded. ${demo.notes}`, entries: demo.entries, warnings: [] });
    setReplayResult(null);
  };

  return (
    <section className="row" style={{ gap: 16 }}>
      {!entries.length ? (
        <div className="card">
          <h3>Guide</h3>
          <p className="muted">1) Válassz forrást (Live / Source / Import / Demo). 2) Importáld a hívásokat. 3) Add meg a kulcsokat. 4) Futtasd a replay auditot.</p>
        </div>
      ) : null}

      <div className="card">
        <div className="chips">
          <button className={tab === "live" ? "" : "secondary"} onClick={() => setTab("live")}>Live Web Auditor</button>
          <button className={tab === "source" ? "" : "secondary"} onClick={() => setTab("source")}>Source Code Reverse-Engineer</button>
          <button className={tab === "import" ? "" : "secondary"} onClick={() => setTab("import")}>Manual/HAR/OpenAPI</button>
          <button className={tab === "demo" ? "" : "secondary"} onClick={() => setTab("demo")}>One-Click Demo</button>
        </div>
      </div>

      {tab === "live" ? (
        <div className="card row two">
          <label title="Web-Crawler audit: headless browser/network capture with SSRF/domain policy.">Runtime crawl URL ⓘ
            <input value={crawlUrl} onChange={(e) => setCrawlUrl(e.target.value)} placeholder="https://example.com" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={() => void runCrawl()} disabled={loading || !crawlUrl}>{loading ? "Auditing…" : "Start Audit"}</button>
          </div>
        </div>
      ) : null}

      {tab === "source" ? (
        <div className="card row">
          <p className="muted" title="Upload full project folder. Supported: .ts/.tsx/.js/.jsx/.env">Upload Project Folder ⓘ</p>
          <input ref={fileInputRef} type="file" multiple onChange={(e) => void runSourceAnalysis(e.target.files)} />
          <div className="pre">{JSON.stringify(sourceFiles, null, 2)}</div>
        </div>
      ) : null}

      {tab === "import" ? (
        <div className="card row two">
          <label title="Choose import format.">Import mode ⓘ
            <select value={mode} onChange={(e) => setMode(e.target.value as TrafficSourceMode)}>
              {["manual", "har_import", "openapi_import", "runtime_browser"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label title="Optional base URL for OpenAPI/manual normalization.">Base URL ⓘ
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
          </label>
          <label style={{ gridColumn: "1 / -1" }} title="Paste raw lines, HAR JSON, or OpenAPI JSON.">Raw input ⓘ
            <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} />
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button onClick={() => void runImport()} disabled={loading}>{loading ? "Importing…" : "Import"}</button>
          </div>
        </div>
      ) : null}

      {tab === "demo" ? (
        <div className="card row two">
          {DEMOS.map((demo) => (
            <button key={demo.name} className="secondary" onClick={() => loadDemo(demo)}>{demo.name}</button>
          ))}
        </div>
      ) : null}

      <div className="card">
        <h3>Diagnostics summary</h3>
        <p>{importResult?.summary ?? "No data imported yet."}</p>
        {(importResult?.warnings ?? []).map((warning, idx) => <p key={idx} className="muted">• {warning}</p>)}
        {importError ? <p>{importError}</p> : null}
      </div>

      <div className="card">
        <h3>Runtime-Observed</h3>
        {runtimeEntries.length ? runtimeEntries.map((entry) => <p key={entry.id}>{entry.method} {entry.pathTemplate} · {entry.auditVerdict}</p>) : <p className="muted">None</p>}
      </div>

      <div className="card">
        <h3>Code-Inferred</h3>
        {inferredEntries.length ? inferredEntries.map((entry) => <p key={entry.id}>{entry.method} {entry.pathTemplate} · {entry.auditVerdict}</p>) : <p className="muted">None</p>}
      </div>

      <div className="card row two">
        <label title="Global header name for replay calls.">Header name ⓘ
          <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
        </label>
        <label title="Global header value for replay calls.">Header value ⓘ
          <input value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} />
        </label>
        <label title="Token injection adds Authorization/apikey across entries.">Global API Key injection ⓘ
          <input value={tokenInjection} onChange={(e) => setTokenInjection(e.target.value)} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }} title="Run entries dependency-aware.">
          <input type="checkbox" checked={chainMode} onChange={(e) => setChainMode(e.target.checked)} style={{ width: 16 }} /> Chain Replay ⓘ
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button onClick={() => void runReplay()} disabled={replayLoading || entries.length === 0}>{replayLoading ? "Running…" : "Run Deep Replay"}</button>
        </div>
      </div>

      <div className="card">
        <h3>Audit Workspace verdicts</h3>
        <p>{replayResult?.summary ?? "No replay yet."}</p>
        {(replayResult?.results ?? []).map((r) => (
          <details key={r.id}>
            <summary>{r.label} · {r.verdict} · {r.statusCode ?? "n/a"}</summary>
            <div className="pre">{r.responsePreview ?? "No response preview"}</div>
            <p>{r.verdictReason}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
