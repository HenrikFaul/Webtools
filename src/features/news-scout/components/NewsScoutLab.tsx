"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SEARCH_ENGINES, SOURCE_TYPE_LABELS } from "@/types/newsScout";
import type {
  ActiveRunsResponse,
  LocationRegistryEntry,
  NewsScanRun,
  NewsScoutConfig,
  NewsScoutTablesResponse,
  NewsSourceChannel,
  NewsSourceScanLog,
  ScheduleType,
  TriggerRunResponse,
  WatchdogResult,
} from "@/types/newsScout";

type Tab = "config" | "runs" | "channels" | "scanlog" | "locations" | "migrate";

const TAB_LABELS: Record<Tab, string> = {
  config: "Konfiguráció",
  runs: "Futások",
  channels: "Forráscsatornák",
  scanlog: "Keresési napló",
  locations: "Helyszínek",
  migrate: "Adatbázis",
};

/* ── tiny helpers ──────────────────────────────────────────────────────────── */

const CHIP = (color: string, bg: string): React.CSSProperties => ({
  background: bg,
  color,
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  display: "inline-block",
  whiteSpace: "nowrap",
});

function statusChip(status: string) {
  const map: Record<string, [string, string]> = {
    queued:    ["#f59e0b", "rgba(245,158,11,0.15)"],
    running:   ["#3b82f6", "rgba(59,130,246,0.15)"],
    completed: ["#22c55e", "rgba(34,197,94,0.15)"],
    cancelled: ["#6b7280", "rgba(107,114,128,0.15)"],
    failed:    ["#ef4444", "rgba(239,68,68,0.15)"],
    ok:        ["#22c55e", "rgba(34,197,94,0.15)"],
    no_match:  ["#9baacf", "rgba(155,170,207,0.12)"],
    error:     ["#ef4444", "rgba(239,68,68,0.15)"],
    skipped:   ["#6b7280", "rgba(107,114,128,0.15)"],
  };
  const [color, bg] = map[status] ?? ["#9baacf", "#1a2440"];
  return <span style={CHIP(color, bg)}>{status}</span>;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null || ms < 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function progressBar(processed: number, total: number) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((processed / total) * 100));
  return (
    <div title={`${processed} / ${total}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, background: "#1a2440", borderRadius: 4, height: 6, overflow: "hidden", minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#4f8cff,#22c55e)", transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color: "#9baacf", flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

const isActive = (s: string) => s === "queued" || s === "running";

/* ======================================================================== */

export function NewsScoutLab() {
  const [tab, setTab] = useState<Tab>("config");

  /* ── config ──────────────────────────────────────────────────────────────── */
  const [cfg, setCfg] = useState<Partial<NewsScoutConfig>>({
    schedule_enabled: false,
    schedule_type: "hours",
    schedule_value: 6,
    search_engines: ["google", "bing"],
    lookback_days: 30,
    webhook_url: "",
    notes: "",
    watchdog_timeout_minutes: 15,
    max_concurrent_runs: 1,
  });
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* ── trigger ─────────────────────────────────────────────────────────────── */
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<(TriggerRunResponse & { error?: string; active_runs?: NewsScanRun[] }) | null>(null);
  const [forceConfirm, setForceConfirm] = useState(false);

  /* ── runs ────────────────────────────────────────────────────────────────── */
  const [runs, setRuns] = useState<NewsScanRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [runsTotalPages, setRunsTotalPages] = useState(1);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsStatusFilter, setRunsStatusFilter] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  /* ── watchdog ────────────────────────────────────────────────────────────── */
  const [watchdogRunning, setWatchdogRunning] = useState(false);
  const [watchdogResult, setWatchdogResult] = useState<WatchdogResult | null>(null);
  const [activeRuns, setActiveRuns] = useState<ActiveRunsResponse["active_runs"]>([]);
  const [autoWatchdog, setAutoWatchdog] = useState(false);
  const autoWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── table browser ───────────────────────────────────────────────────────── */
  type BrowseTable = "news_source_channels" | "news_source_scan_log" | "location_registry";
  const [browseTable, setBrowseTable] = useState<BrowseTable>("news_source_channels");
  const [browseCity, setBrowseCity] = useState("");
  const [browsePostcode, setBrowsePostcode] = useState("");
  const [browseCounty, setBrowseCounty] = useState("");
  const [browseHadMatch, setBrowseHadMatch] = useState("");
  const [browseActive, setBrowseActive] = useState("");
  const [browsePage, setBrowsePage] = useState(1);
  const [browseData, setBrowseData] = useState<NewsScoutTablesResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  /* ── migrate ─────────────────────────────────────────────────────────────── */
  const [migrateStatus, setMigrateStatus] = useState<Record<string, boolean> | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [showSql, setShowSql] = useState(false);

  /* ════════════════════════════════════════════════════════════════════════════
     Config
  ══════════════════════════════════════════════════════════════════════════════*/

  const loadConfig = useCallback(async () => {
    setCfgLoading(true);
    try {
      const r = await fetch("/api/news-scout/config");
      const json = (await r.json()) as NewsScoutConfig & { error?: string };
      if (!r.ok) throw new Error(json.error ?? "Config betöltési hiba");
      setCfg({
        ...json,
        search_engines: Array.isArray(json.search_engines) ? json.search_engines : ["google", "bing"],
        webhook_url: json.webhook_url ?? "",
        notes: json.notes ?? "",
        watchdog_timeout_minutes: json.watchdog_timeout_minutes ?? 15,
        max_concurrent_runs: json.max_concurrent_runs ?? 1,
      });
    } catch (err) {
      setCfgMsg({ ok: false, text: err instanceof Error ? err.message : "Hiba" });
    }
    setCfgLoading(false);
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const saveConfig = useCallback(async () => {
    setCfgSaving(true);
    setCfgMsg(null);
    try {
      const r = await fetch("/api/news-scout/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schedule_enabled: cfg.schedule_enabled ?? false,
          schedule_type: cfg.schedule_type ?? "hours",
          schedule_value: cfg.schedule_value ?? 6,
          search_engines: cfg.search_engines ?? ["google"],
          lookback_days: cfg.lookback_days ?? 30,
          webhook_url: cfg.webhook_url || undefined,
          notes: cfg.notes || undefined,
          watchdog_timeout_minutes: cfg.watchdog_timeout_minutes ?? 15,
          max_concurrent_runs: cfg.max_concurrent_runs ?? 1,
        }),
      });
      const json = (await r.json()) as NewsScoutConfig & { error?: string };
      if (!r.ok) throw new Error(json.error ?? "Mentési hiba");
      setCfg({ ...json, webhook_url: json.webhook_url ?? "", notes: json.notes ?? "" });
      setCfgMsg({ ok: true, text: "Konfiguráció mentve." });
    } catch (err) {
      setCfgMsg({ ok: false, text: err instanceof Error ? err.message : "Hiba" });
    }
    setCfgSaving(false);
  }, [cfg]);

  const toggleEngine = (id: string) => {
    setCfg((prev) => {
      const engines = prev.search_engines ?? [];
      return { ...prev, search_engines: engines.includes(id) ? engines.filter((e) => e !== id) : [...engines, id] };
    });
  };

  /* ════════════════════════════════════════════════════════════════════════════
     Trigger
  ══════════════════════════════════════════════════════════════════════════════*/

  const triggerRun = useCallback(async (force = false) => {
    setTriggering(true);
    setTriggerResult(null);
    setForceConfirm(false);
    try {
      const r = await fetch("/api/news-scout/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await r.json() as TriggerRunResponse & { error?: string; active_runs?: NewsScanRun[] };
      if (r.status === 409) {
        // already_active – show confirm dialog
        setTriggerResult(json);
        setForceConfirm(true);
        setTriggering(false);
        return;
      }
      if (!r.ok) throw new Error(json.error ?? "Trigger hiba");
      setTriggerResult(json);
      void loadRuns(1);
      void checkActiveRuns();
    } catch (err) {
      setTriggerResult({ run_id: "", status: "error", webhook_called: false, webhook_error: err instanceof Error ? err.message : "Hiba" });
    }
    setTriggering(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ════════════════════════════════════════════════════════════════════════════
     Runs
  ══════════════════════════════════════════════════════════════════════════════*/

  const loadRuns = useCallback(async (page = 1) => {
    setRunsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (runsStatusFilter) params.set("status", runsStatusFilter);
      const r = await fetch(`/api/news-scout/runs?${params}`);
      const json = await r.json() as { runs: NewsScanRun[]; total: number; page: number; totalPages: number; error?: string };
      if (!r.ok) throw new Error(json.error ?? "Hiba");
      setRuns(json.runs ?? []);
      setRunsTotal(json.total ?? 0);
      setRunsPage(json.page ?? 1);
      setRunsTotalPages(json.totalPages ?? 1);
    } catch { /* silent */ }
    setRunsLoading(false);
  }, [runsStatusFilter]);

  useEffect(() => {
    if (tab === "runs") void loadRuns(1);
  }, [tab, loadRuns]);

  const cancelRun = useCallback(async (runId: string) => {
    setCancellingId(runId);
    try {
      const r = await fetch(`/api/news-scout/runs/${runId}/cancel`, { method: "POST" });
      const json = await r.json() as { error?: string };
      if (!r.ok) throw new Error(json.error ?? "Cancel hiba");
      void loadRuns(runsPage);
      void checkActiveRuns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Leállítás sikertelen");
    }
    setCancellingId(null);
  }, [runsPage, loadRuns]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ════════════════════════════════════════════════════════════════════════════
     Watchdog
  ══════════════════════════════════════════════════════════════════════════════*/

  const checkActiveRuns = useCallback(async () => {
    try {
      const r = await fetch("/api/news-scout/watchdog");
      if (!r.ok) return;
      const json = await r.json() as ActiveRunsResponse;
      setActiveRuns(json.active_runs ?? []);
    } catch { /* silent */ }
  }, []);

  const runWatchdog = useCallback(async () => {
    setWatchdogRunning(true);
    setWatchdogResult(null);
    try {
      const r = await fetch("/api/news-scout/watchdog", { method: "POST" });
      const json = await r.json() as WatchdogResult & { error?: string };
      if (!r.ok) throw new Error(json.error ?? "Watchdog hiba");
      setWatchdogResult(json);
      void loadRuns(runsPage);
      void checkActiveRuns();
    } catch (err) {
      setWatchdogResult({ checked_at: new Date().toISOString(), active_runs_found: 0, killed: [], timeout_minutes: 0 });
      alert(err instanceof Error ? err.message : "Watchdog hiba");
    }
    setWatchdogRunning(false);
  }, [runsPage, loadRuns, checkActiveRuns]);

  // Auto-watchdog interval
  useEffect(() => {
    if (autoWatchdog) {
      autoWatchdogRef.current = setInterval(() => { void runWatchdog(); }, 60_000);
    } else {
      if (autoWatchdogRef.current) clearInterval(autoWatchdogRef.current);
    }
    return () => { if (autoWatchdogRef.current) clearInterval(autoWatchdogRef.current); };
  }, [autoWatchdog, runWatchdog]);

  // Poll active runs while on runs tab
  useEffect(() => {
    if (tab !== "runs") return;
    void checkActiveRuns();
    const id = setInterval(() => { void checkActiveRuns(); }, 15_000);
    return () => clearInterval(id);
  }, [tab, checkActiveRuns]);

  /* ════════════════════════════════════════════════════════════════════════════
     Table browser
  ══════════════════════════════════════════════════════════════════════════════*/

  const loadBrowse = useCallback(async (page = 1) => {
    setBrowseLoading(true);
    try {
      const params = new URLSearchParams({ table: browseTable, page: String(page), pageSize: "50" });
      if (browseCity) params.set("city", browseCity);
      if (browsePostcode) params.set("postcode", browsePostcode);
      if (browseCounty) params.set("county", browseCounty);
      if (browseTable === "news_source_scan_log" && browseHadMatch) params.set("had_match", browseHadMatch);
      if (browseTable === "news_source_channels" && browseActive) params.set("active", browseActive);
      const r = await fetch(`/api/news-scout/tables?${params}`);
      const json = await r.json() as NewsScoutTablesResponse & { error?: string };
      if (!r.ok) throw new Error(json.error ?? "Hiba");
      setBrowseData(json);
      setBrowsePage(page);
    } catch { setBrowseData(null); }
    setBrowseLoading(false);
  }, [browseTable, browseCity, browsePostcode, browseCounty, browseHadMatch, browseActive]);

  const channelTab = tab === "channels";
  const scanlogTab = tab === "scanlog";
  const locTab = tab === "locations";
  const activeBrowseTab = channelTab || scanlogTab || locTab;

  useEffect(() => {
    if (channelTab) { setBrowseTable("news_source_channels"); setBrowseData(null); }
    if (scanlogTab) { setBrowseTable("news_source_scan_log"); setBrowseData(null); }
    if (locTab)     { setBrowseTable("location_registry");    setBrowseData(null); }
  }, [channelTab, scanlogTab, locTab]);

  /* ════════════════════════════════════════════════════════════════════════════
     Migrate check
  ══════════════════════════════════════════════════════════════════════════════*/

  const checkMigrate = useCallback(async () => {
    setMigrateLoading(true);
    try {
      const r = await fetch("/api/news-scout/migrate");
      const json = await r.json() as { tables: Record<string, boolean>; all_ready: boolean; error?: string };
      if (!r.ok) throw new Error(json.error ?? "Hiba");
      setMigrateStatus(json.tables ?? {});
    } catch { setMigrateStatus(null); }
    setMigrateLoading(false);
  }, []);

  useEffect(() => { if (tab === "migrate") void checkMigrate(); }, [tab, checkMigrate]);

  /* ════════════════════════════════════════════════════════════════════════════
     Render
  ══════════════════════════════════════════════════════════════════════════════*/

  return (
    <section style={{ display: "grid", gap: 16 }}>

      {/* ── Header + Trigger ── */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Hírfelderítő Motor</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Magyarországi közérdekű hírforrás-csatornák folyamatos felfedezése, validálása és naplózása — settlement-szintű, megye szerint csoportosítva.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          {!forceConfirm ? (
            <button
              onClick={() => void triggerRun(false)}
              disabled={triggering}
              style={{ width: "auto", padding: "10px 24px", fontWeight: 700, background: triggering ? undefined : "linear-gradient(135deg,#4f8cff,#3b5bdb)" }}
            >
              {triggering ? "Indítás…" : "▶ Manuális futtatás"}
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#f59e0b" }}>Már fut aktív futás. Kényszer-indítás?</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="secondary" onClick={() => setForceConfirm(false)} style={{ width: "auto", padding: "6px 14px", fontSize: 12 }}>Mégse</button>
                <button onClick={() => void triggerRun(true)} style={{ width: "auto", padding: "6px 14px", fontSize: 12, background: "#dc2626" }}>
                  ⚡ Force indítás
                </button>
              </div>
            </div>
          )}
          {triggerResult && !forceConfirm && (
            <div style={{ fontSize: 12, textAlign: "right" }}>
              {triggerResult.run_id
                ? <span style={{ color: "#22c55e" }}>Futás létrehozva: <code style={{ fontSize: 11 }}>{triggerResult.run_id.slice(0, 8)}…</code></span>
                : triggerResult.error === "already_active"
                  ? null
                  : <span style={{ color: "#ef4444" }}>{triggerResult.webhook_error ?? triggerResult.error}</span>
              }
              {triggerResult.webhook_called && <div className="muted">Webhook meghívva ✓</div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "" : "secondary"} onClick={() => setTab(t)} style={{ width: "auto", padding: "7px 18px", fontSize: 13 }}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
           KONFIGURÁCIÓ
      ══════════════════════════════════════════════════════════════════════*/}
      {tab === "config" && (<>
        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Ütemezés</h3>
          <div className="row two" style={{ alignItems: "center", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={cfg.schedule_enabled ?? false} onChange={(e) => setCfg((p) => ({ ...p, schedule_enabled: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "#4f8cff", cursor: "pointer" }} />
              <span>Automatikus ütemezés engedélyezve</span>
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>Futás minden</span>
              <input type="number" min={1} max={999} value={cfg.schedule_value ?? 6} onChange={(e) => setCfg((p) => ({ ...p, schedule_value: parseInt(e.target.value, 10) || 1 }))} style={{ width: 72, textAlign: "center" }} disabled={!cfg.schedule_enabled} />
              <select value={cfg.schedule_type ?? "hours"} onChange={(e) => setCfg((p) => ({ ...p, schedule_type: e.target.value as ScheduleType }))} style={{ width: "auto" }} disabled={!cfg.schedule_enabled}>
                <option value="minutes">percenként</option>
                <option value="hours">óránként</option>
                <option value="days">naponta</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Max párhuzamos futás</span>
              <input type="number" min={1} max={10} value={cfg.max_concurrent_runs ?? 1} onChange={(e) => setCfg((p) => ({ ...p, max_concurrent_runs: parseInt(e.target.value, 10) || 1 }))} style={{ width: 80 }} />
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 0", lineHeight: 1.6 }}>Az ütemezést az n8n workflow Schedule Trigger-je hajtja végre. A max párhuzamos futás megvéd az egyszerre induló duplikált futásoktól.</p>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Visszatekintési ablak</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="number" min={1} max={365} value={cfg.lookback_days ?? 30} onChange={(e) => setCfg((p) => ({ ...p, lookback_days: parseInt(e.target.value, 10) || 30 }))} style={{ width: 80, textAlign: "center" }} />
            <span className="muted" style={{ fontSize: 13 }}>nap visszamenőleg (max. 365, ajánlott: 30)</span>
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Watchdog időkorlát</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="number" min={1} max={1440} value={cfg.watchdog_timeout_minutes ?? 15} onChange={(e) => setCfg((p) => ({ ...p, watchdog_timeout_minutes: parseInt(e.target.value, 10) || 15 }))} style={{ width: 80, textAlign: "center" }} />
            <span className="muted" style={{ fontSize: 13 }}>perc csend után a watchdog megöli az elakadt futást</span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0", lineHeight: 1.6 }}>
            Ha egy <code>queued</code> vagy <code>running</code> futástól ennyi perc alatt nem érkezik heartbeat (vagy nem indult el), a watchdog <code>failed</code>-re állítja. A heartbeat endpoint: <code>POST /api/news-scout/runs/&#123;runId&#125;/heartbeat</code>
          </p>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Keresőmotorok</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {SEARCH_ENGINES.map((eng) => {
              const selected = (cfg.search_engines ?? []).includes(eng.id);
              return (
                <label key={eng.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "10px 14px", borderRadius: 8, border: `1px solid ${selected ? "rgba(79,140,255,0.4)" : "#233158"}`, background: selected ? "rgba(79,140,255,0.08)" : "#1a2440", transition: "all 0.15s" }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleEngine(eng.id)} style={{ width: 16, height: 16, accentColor: "#4f8cff", cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: selected ? "#eef3ff" : "#9baacf" }}>{eng.label}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{eng.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Webhook URL (n8n)</h3>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 10px", lineHeight: 1.6 }}>
            Az n8n Webhook Trigger URL-je. A manuális indítás és az ütemező is ide küldi a <code>run_id</code>-t, a <code>lookback_days</code>-t és a <code>search_engines</code> listát. Az n8n workflow a heartbeat endpointon keresztül jelzi az előrehaladást.
          </p>
          <input type="url" value={cfg.webhook_url ?? ""} onChange={(e) => setCfg((p) => ({ ...p, webhook_url: e.target.value }))} placeholder="https://your-n8n.example.com/webhook/news-scout" />
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 14px" }}>Megjegyzés</h3>
          <textarea value={cfg.notes ?? ""} onChange={(e) => setCfg((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Belső megjegyzés…" />
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => void saveConfig()} disabled={cfgSaving || cfgLoading} style={{ width: "auto", padding: "10px 28px" }}>
            {cfgSaving ? "Mentés…" : cfgLoading ? "Betöltés…" : "Konfiguráció mentése"}
          </button>
          {cfgMsg && <span style={{ fontSize: 13, color: cfgMsg.ok ? "#22c55e" : "#ef4444" }}>{cfgMsg.text}</span>}
        </div>
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
           FUTÁSOK
      ══════════════════════════════════════════════════════════════════════*/}
      {tab === "runs" && (<>

        {/* ── Active runs + Watchdog panel ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Aktív futások ({activeRuns.length})</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={autoWatchdog} onChange={(e) => setAutoWatchdog(e.target.checked)} style={{ accentColor: "#4f8cff" }} />
                Auto-watchdog (1 perces)
              </label>
              <button
                onClick={() => void runWatchdog()}
                disabled={watchdogRunning}
                style={{ width: "auto", padding: "6px 16px", fontSize: 12, background: watchdogRunning ? undefined : "#7c3aed" }}
              >
                {watchdogRunning ? "Ellenőrzés…" : "🐕 Watchdog futtatása"}
              </button>
            </div>
          </div>

          {activeRuns.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nincs aktív futás. (15 másodpercenként frissül)</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {activeRuns.map((r) => {
                const silentWarn = (r.silent_minutes ?? 0) >= (cfg.watchdog_timeout_minutes ?? 15);
                return (
                  <div key={r.run_id} style={{ padding: "10px 14px", borderRadius: 8, background: silentWarn ? "rgba(239,68,68,0.08)" : "rgba(59,130,246,0.08)", border: `1px solid ${silentWarn ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.25)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {statusChip(r.status)}
                        <code style={{ fontSize: 11, color: "#9baacf" }}>{r.run_id.slice(0, 8)}…</code>
                        <span className="muted" style={{ fontSize: 12 }}>Indult: {fmt(r.started_at)}</span>
                      </div>
                      <button
                        onClick={() => void cancelRun(r.run_id)}
                        disabled={cancellingId === r.run_id}
                        style={{ width: "auto", padding: "4px 12px", fontSize: 11, background: "#dc2626", flexShrink: 0 }}
                      >
                        {cancellingId === r.run_id ? "…" : "⏹ Leállítás"}
                      </button>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                      {r.progress_total > 0
                        ? progressBar(r.progress_processed, r.progress_total)
                        : <span className="muted" style={{ fontSize: 12 }}>Folyamat: nincs még adat</span>
                      }
                      <span className="muted" style={{ fontSize: 12 }}>
                        Utolsó jelzés:{" "}
                        <span style={{ color: silentWarn ? "#ef4444" : "#9baacf", fontWeight: silentWarn ? 700 : 400 }}>
                          {r.silent_minutes != null ? `${r.silent_minutes} perce` : "—"}
                          {silentWarn ? " ⚠ elakadt" : ""}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {watchdogResult && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#1a2440", fontSize: 13 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>Watchdog eredménye</span>
                <span className="muted" style={{ fontSize: 12 }}>{fmt(watchdogResult.checked_at)}</span>
                <span className="muted" style={{ fontSize: 12 }}>Aktív volt: {watchdogResult.active_runs_found}</span>
                <span style={{ color: watchdogResult.killed.length > 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                  {watchdogResult.killed.length > 0 ? `Megölt: ${watchdogResult.killed.length}` : "Nincs elakadt futás ✓"}
                </span>
              </div>
              {watchdogResult.killed.map((k) => (
                <div key={k.run_id} style={{ marginTop: 6, color: "#ef4444", fontSize: 12 }}>
                  ✗ <code>{k.run_id.slice(0, 8)}…</code> [{k.was_status}] — {k.reason}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Run history table ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={runsStatusFilter} onChange={(e) => setRunsStatusFilter(e.target.value)} style={{ width: "auto" }}>
                <option value="">Összes státusz</option>
                <option value="queued">queued</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
                <option value="failed">failed</option>
              </select>
              <button className="secondary" onClick={() => void loadRuns(1)} disabled={runsLoading} style={{ width: "auto", padding: "6px 16px" }}>
                {runsLoading ? "…" : "Frissítés"}
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>Összes: {runsTotal} futás</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #233158" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Kezdés</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Vége</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Időtartam</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Státusz</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Előrehaladás</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Trigger</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Helyszínek</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Új forrás</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Találat</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Hiba</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Futás ID</th>
                  <th style={{ padding: "6px 8px" }} />
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr><td colSpan={12} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>
                    {runsLoading ? "Betöltés…" : "Nincs találat."}
                  </td></tr>
                )}
                {runs.map((r) => (
                  <tr key={r.run_id} style={{ borderBottom: "1px solid #1a2440" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(r.started_at)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(r.finished_at)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmtDuration(r.duration_ms)}</td>
                    <td style={{ padding: "6px 8px" }}>{statusChip(r.status)}</td>
                    <td style={{ padding: "6px 8px", minWidth: 120 }}>
                      {r.progress_total > 0
                        ? progressBar(r.progress_processed, r.progress_total)
                        : <span className="muted" style={{ fontSize: 11 }}>—</span>
                      }
                    </td>
                    <td style={{ padding: "6px 8px" }}><span style={CHIP("#9baacf", "#1a2440")}>{r.trigger_type}</span></td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.total_locations.toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: r.total_new_sources_found > 0 ? "#22c55e" : undefined }}>
                      {r.total_new_sources_found > 0 ? `+${r.total_new_sources_found}` : r.total_new_sources_found}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: r.total_sources_with_matches > 0 ? "#4f8cff" : undefined }}>
                      {r.total_sources_with_matches.toLocaleString()}
                    </td>
                    <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#ef4444", fontSize: 11 }} title={r.error_message ?? ""}>
                      {r.error_message ?? "—"}
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 10, color: "#9baacf" }}>{r.run_id.slice(0, 8)}…</td>
                    <td style={{ padding: "4px 8px" }}>
                      {isActive(r.status) && (
                        <button
                          onClick={() => void cancelRun(r.run_id)}
                          disabled={cancellingId === r.run_id}
                          style={{ width: "auto", padding: "3px 10px", fontSize: 11, background: "#dc2626" }}
                        >
                          {cancellingId === r.run_id ? "…" : "⏹"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {runsTotalPages > 1 && (
            <div className="chips" style={{ marginTop: 10 }}>
              <button className="secondary" disabled={runsPage <= 1 || runsLoading} onClick={() => void loadRuns(runsPage - 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>← Előző</button>
              <span className="muted" style={{ fontSize: 12, padding: "4px 8px" }}>{runsPage} / {runsTotalPages}</span>
              <button className="secondary" disabled={runsPage >= runsTotalPages || runsLoading} onClick={() => void loadRuns(runsPage + 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Következő →</button>
            </div>
          )}
        </div>

        {/* Heartbeat info */}
        <div className="card">
          <h3 style={{ margin: "0 0 8px" }}>Heartbeat integráció (n8n)</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
            Az n8n workflow minden <strong>X helyszín</strong> feldolgozása után POST-ot küld a heartbeat endpointra. Ez frissíti az előrehaladást és megmutatja, hogy a futás él-e.<br />
            <code style={{ fontSize: 11 }}>POST /api/news-scout/runs/&#123;run_id&#125;/heartbeat</code><br />
            Body: <code style={{ fontSize: 11 }}>{'{"progress_processed": 42, "progress_total": 1000, "status": "running"}'}</code><br />
            Ha a válaszban <code>should_stop: true</code> jön vissza (mert manuálisan leállítottuk), az n8n workflow leállítja magát.
          </div>
        </div>
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
           TABLE BROWSER
      ══════════════════════════════════════════════════════════════════════*/}
      {activeBrowseTab && (<>
        <div className="card">
          <div className="row two" style={{ gap: 10 }}>
            <label>Város / település<input value={browseCity} onChange={(e) => setBrowseCity(e.target.value)} placeholder="pl. Budapest, Győr…" /></label>
            <label>Irányítószám<input value={browsePostcode} onChange={(e) => setBrowsePostcode(e.target.value)} placeholder="pl. 1013" /></label>
            <label>Megye<input value={browseCounty} onChange={(e) => setBrowseCounty(e.target.value)} placeholder="pl. Pest, Győr-Moson…" /></label>
            {scanlogTab && (
              <label>Volt-e találat?
                <select value={browseHadMatch} onChange={(e) => setBrowseHadMatch(e.target.value)}>
                  <option value="">Mind</option>
                  <option value="true">Igen</option>
                  <option value="false">Nem</option>
                </select>
              </label>
            )}
            {channelTab && (
              <label>Aktív?
                <select value={browseActive} onChange={(e) => setBrowseActive(e.target.value)}>
                  <option value="">Mind</option>
                  <option value="true">Aktív</option>
                  <option value="false">Inaktív</option>
                </select>
              </label>
            )}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button onClick={() => void loadBrowse(1)} disabled={browseLoading} style={{ width: "auto", padding: "8px 24px" }}>{browseLoading ? "Betöltés…" : "Lekérés"}</button>
              <button className="secondary" onClick={() => { setBrowseCity(""); setBrowsePostcode(""); setBrowseCounty(""); setBrowseHadMatch(""); setBrowseActive(""); setBrowseData(null); }} style={{ width: "auto", padding: "8px 16px" }}>Törlés</button>
            </div>
          </div>
        </div>

        {browseData && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>Összes: <strong>{browseData.total.toLocaleString()}</strong> · Oldal {browseData.page}/{browseData.totalPages}</span>
              <div className="chips">
                <button className="secondary" disabled={browsePage <= 1 || browseLoading} onClick={() => void loadBrowse(browsePage - 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>← Előző</button>
                <button className="secondary" disabled={browsePage >= browseData.totalPages || browseLoading} onClick={() => void loadBrowse(browsePage + 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Következő →</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              {channelTab && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: "2px solid #233158" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Forrás neve</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Típus</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Város</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>IRSZ</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Megye</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>URL</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Conf.</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Aktív</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Utolsó találat</th>
                  </tr></thead>
                  <tbody>
                    {(browseData.rows as unknown as NewsSourceChannel[]).map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #1a2440" }}>
                        <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.source_name ?? ""}>{row.source_name ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}><span style={CHIP("#9baacf", "#0f1630")}>{SOURCE_TYPE_LABELS[row.source_type] ?? row.source_type}</span></td>
                        <td style={{ padding: "6px 8px" }}>{row.city}</td>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{row.postcode}</td>
                        <td style={{ padding: "6px 8px" }}>{row.county_name ?? "—"}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <a href={row.source_base_url} target="_blank" rel="noopener noreferrer" style={{ color: "#4f8cff", textDecoration: "none", fontSize: 11 }}>{row.source_base_url}</a>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                          <span style={{ color: row.confidence_score >= 0.9 ? "#22c55e" : row.confidence_score >= 0.7 ? "#f59e0b" : "#ef4444" }}>{Number(row.confidence_score).toFixed(2)}</span>
                        </td>
                        <td style={{ padding: "6px 8px" }}><span style={{ color: row.active ? "#22c55e" : "#ef4444" }}>{row.active ? "✓" : "✗"}</span></td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "#9baacf", fontSize: 11 }}>{fmt(row.last_match_at)}</td>
                      </tr>
                    ))}
                    {browseData.rows.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>Nincs találat.</td></tr>}
                  </tbody>
                </table>
              )}

              {scanlogTab && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: "2px solid #233158" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Keresés időpontja</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Város</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>IRSZ</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Forrás URL</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Találat?</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Db</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Conf.</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Státusz</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Kategóriák</th>
                  </tr></thead>
                  <tbody>
                    {(browseData.rows as unknown as NewsSourceScanLog[]).map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #1a2440" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(row.scanned_at)}</td>
                        <td style={{ padding: "6px 8px" }}>{row.city}</td>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{row.postcode}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.best_evidence_url
                            ? <a href={row.best_evidence_url} target="_blank" rel="noopener noreferrer" style={{ color: "#4f8cff", fontSize: 11 }}>{row.source_base_url}</a>
                            : row.source_base_url}
                        </td>
                        <td style={{ padding: "6px 8px" }}><span style={{ color: row.had_match ? "#22c55e" : "#9baacf" }}>{row.had_match ? "✓ igen" : "✗ nem"}</span></td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.match_count_estimate ?? "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                          <span style={{ color: row.confidence_score >= 0.9 ? "#22c55e" : row.confidence_score >= 0.7 ? "#f59e0b" : "#ef4444" }}>{Number(row.confidence_score).toFixed(2)}</span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>{statusChip(row.status)}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#9baacf", fontSize: 11 }}>
                          {Array.isArray(row.matched_categories) ? row.matched_categories.join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                    {browseData.rows.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>Nincs találat.</td></tr>}
                  </tbody>
                </table>
              )}

              {locTab && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: "2px solid #233158" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Város</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>IRSZ</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Megye</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Normalizált</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Kerületvariáns</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Aliasok</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Frissítve</th>
                  </tr></thead>
                  <tbody>
                    {(browseData.rows as unknown as LocationRegistryEntry[]).map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #1a2440" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 500 }}>{row.city}</td>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{row.postcode}</td>
                        <td style={{ padding: "6px 8px" }}>{row.county_name ?? "—"}</td>
                        <td style={{ padding: "6px 8px", color: "#9baacf", fontFamily: "monospace", fontSize: 11 }}>{row.normalized_city ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{row.district_variant ?? "—"}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#9baacf", fontSize: 11 }}>
                          {Array.isArray(row.search_aliases) ? row.search_aliases.join(", ") : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", color: "#9baacf", fontSize: 11, whiteSpace: "nowrap" }}>{fmt(row.updated_at)}</td>
                      </tr>
                    ))}
                    {browseData.rows.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>Nincs találat.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
           ADATBÁZIS / MIGRATE
      ══════════════════════════════════════════════════════════════════════*/}
      {tab === "migrate" && (<>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Adatbázis táblák állapota</h3>
            <button className="secondary" onClick={() => void checkMigrate()} disabled={migrateLoading} style={{ width: "auto", padding: "6px 16px" }}>
              {migrateLoading ? "Ellenőrzés…" : "Ellenőrzés"}
            </button>
          </div>
          {migrateStatus ? (
            <div style={{ display: "grid", gap: 8 }}>
              {Object.entries(migrateStatus).map(([tbl, ok]) => (
                <div key={tbl} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: ok ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
                  <code style={{ fontSize: 13, flex: 1 }}>public.{tbl}</code>
                  <span style={{ fontSize: 12, color: ok ? "#22c55e" : "#ef4444" }}>{ok ? "OK" : "Hiányzik"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>{migrateLoading ? "Ellenőrzés…" : "Kattints az Ellenőrzés gombra."}</p>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Migrációs SQL fájlok</h3>
            <button className="secondary" onClick={() => setShowSql((v) => !v)} style={{ width: "auto", padding: "6px 16px", fontSize: 12 }}>
              {showSql ? "Elrejtés" : "SQL megmutatása"}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
            <strong>1.</strong> <code>supabase/migrations/news_scout_tables.sql</code> — alaptáblák, enumok, indexek, triggerek, upsert helper<br />
            <strong>2.</strong> <code>supabase/migrations/news_scout_v2_watchdog.sql</code> — heartbeat, progress, watchdog oszlopok + DB-oldali watchdog függvény
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Futtatandó a <strong>geodata Supabase projekt SQL Editorában</strong>, ebben a sorrendben.</p>
          {showSql && (
            <pre style={{ marginTop: 12, background: "#0b1020", border: "1px solid #233158", borderRadius: 8, padding: 14, fontSize: 11, overflowX: "auto", maxHeight: 400, overflowY: "auto", color: "#eef3ff", lineHeight: 1.5 }}>
              {`-- ── news_scout_v2_watchdog.sql (kivonat) ────────────────────────────\n\nalter table public.news_scan_runs\n  add column if not exists last_heartbeat_at  timestamptz,\n  add column if not exists progress_processed integer not null default 0,\n  add column if not exists progress_total     integer not null default 0,\n  add column if not exists cancelled_at       timestamptz,\n  add column if not exists error_message      text;\n\nalter table public.news_scout_config\n  add column if not exists watchdog_timeout_minutes integer not null default 15,\n  add column if not exists max_concurrent_runs      integer not null default 1;\n\ncreate or replace function public.news_scout_watchdog(p_timeout_minutes integer default 15)\nreturns table (killed_run_id uuid, was_status text, reason text)\nlanguage plpgsql as $$\nbegin\n  return query\n  with victims as (\n    select run_id, status,\n      case\n        when status = 'queued' then 'Queued de ' || p_timeout_minutes || ' perce nem indult'\n        else 'Running de heartbeat régebbi ' || p_timeout_minutes || ' percnél'\n      end as kill_reason\n    from public.news_scan_runs\n    where status in ('queued','running')\n      and coalesce(last_heartbeat_at, started_at) < now() - (p_timeout_minutes||' minutes')::interval\n  ),\n  killed as (\n    update public.news_scan_runs r\n    set status='failed', finished_at=now(), cancelled_at=now(), error_message=v.kill_reason\n    from victims v where r.run_id=v.run_id\n    returning r.run_id, v.kill_reason, v.status\n  )\n  select killed.run_id, killed.status, killed.kill_reason from killed;\nend;\n$$;\n\n-- Teljes fájl: supabase/migrations/news_scout_v2_watchdog.sql`}
            </pre>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>Architektúra</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
            <strong>news_scan_runs</strong> – minden futás; <code>status</code>: queued → running → completed/failed/cancelled<br />
            <strong>news_source_channels</strong> – forrásregiszter, upsert logika<br />
            <strong>news_source_scan_log</strong> – append-only ellenőrzési napló<br />
            <strong>location_registry</strong> – normalizált helyszínjegyzék<br />
            <strong>news_scout_config</strong> – egyetlen konfiguráció-sor<br /><br />
            <strong>Heartbeat endpoint:</strong> <code>POST /api/news-scout/runs/&#123;runId&#125;/heartbeat</code><br />
            <strong>Cancel endpoint:</strong> <code>POST /api/news-scout/runs/&#123;runId&#125;/cancel</code><br />
            <strong>Watchdog endpoint:</strong> <code>POST /api/news-scout/watchdog</code> (GET = csak lekérdez, nem öl)<br />
            <strong>Trigger guard:</strong> <code>409 already_active</code> ha már fut, force=true felülírja
          </div>
        </div>
      </>)}
    </section>
  );
}
