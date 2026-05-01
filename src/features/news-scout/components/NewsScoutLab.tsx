"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SEARCH_ENGINES,
  SOURCE_TYPE_LABELS,
} from "@/types/newsScout";
import type {
  NewsScoutConfig,
  NewsScanRun,
  NewsSourceChannel,
  NewsSourceScanLog,
  LocationRegistryEntry,
  NewsScoutTablesResponse,
  TriggerRunResponse,
  ScheduleType,
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

const CHIP = (color: string, bg: string) => ({
  background: bg,
  color,
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  display: "inline-block",
});

function statusChip(status: string) {
  const map: Record<string, [string, string]> = {
    queued:    ["#f59e0b", "rgba(245,158,11,0.15)"],
    running:   ["#3b82f6", "rgba(59,130,246,0.15)"],
    completed: ["#22c55e", "rgba(34,197,94,0.15)"],
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
  if (ms == null) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/* ======================================================================== */

export function NewsScoutLab() {
  const [tab, setTab] = useState<Tab>("config");

  // ── Config state ──────────────────────────────────────────────────────────
  const [cfg, setCfg] = useState<Partial<NewsScoutConfig>>({
    schedule_enabled: false,
    schedule_type: "hours",
    schedule_value: 6,
    search_engines: ["google", "bing"],
    lookback_days: 30,
    webhook_url: "",
    notes: "",
  });
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Trigger state ─────────────────────────────────────────────────────────
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerRunResponse | null>(null);

  // ── Runs state ────────────────────────────────────────────────────────────
  const [runs, setRuns] = useState<NewsScanRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [runsTotalPages, setRunsTotalPages] = useState(1);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsStatusFilter, setRunsStatusFilter] = useState("");

  // ── Table browser state ───────────────────────────────────────────────────
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

  // ── Migrate state ─────────────────────────────────────────────────────────
  const [migrateStatus, setMigrateStatus] = useState<Record<string, boolean> | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [showSql, setShowSql] = useState(false);

  // ── Load config ───────────────────────────────────────────────────────────
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
      });
    } catch (err) {
      setCfgMsg({ ok: false, text: err instanceof Error ? err.message : "Hiba" });
    }
    setCfgLoading(false);
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  // ── Save config ───────────────────────────────────────────────────────────
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
      const next = engines.includes(id) ? engines.filter((e) => e !== id) : [...engines, id];
      return { ...prev, search_engines: next };
    });
  };

  // ── Trigger run ───────────────────────────────────────────────────────────
  const triggerRun = useCallback(async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const r = await fetch("/api/news-scout/trigger", { method: "POST" });
      const json = (await r.json()) as TriggerRunResponse & { error?: string };
      if (!r.ok) throw new Error(json.error ?? "Trigger hiba");
      setTriggerResult(json);
      if (tab === "runs") void loadRuns(1);
    } catch (err) {
      setTriggerResult({ run_id: "", status: "error", webhook_called: false, webhook_error: err instanceof Error ? err.message : "Hiba" });
    }
    setTriggering(false);
  }, [tab]); // loadRuns defined below, using ref-pattern is unnecessary here

  // ── Load runs ─────────────────────────────────────────────────────────────
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

  // ── Browse table ──────────────────────────────────────────────────────────
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

  // ── Migrate check ─────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (tab === "migrate") void checkMigrate();
  }, [tab, checkMigrate]);

  // ── Derived tabs for table browser ────────────────────────────────────────
  const channelTab = tab === "channels";
  const scanlogTab = tab === "scanlog";
  const locTab = tab === "locations";
  const activeBrowseTab = channelTab || scanlogTab || locTab;

  useEffect(() => {
    if (channelTab) { setBrowseTable("news_source_channels"); setBrowseData(null); }
    if (scanlogTab) { setBrowseTable("news_source_scan_log"); setBrowseData(null); }
    if (locTab) { setBrowseTable("location_registry"); setBrowseData(null); }
  }, [channelTab, scanlogTab, locTab]);

  /* ======================================================================== */
  return (
    <section style={{ display: "grid", gap: 16 }}>

      {/* Header + Trigger */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Hírfelderítő Motor</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Magyarországi közérdekű hírforrás-csatornák folyamatos felfedezése, validálása és naplózása — settlement-szintű, megye szerint csoportosítva.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => void triggerRun()}
            disabled={triggering}
            style={{ width: "auto", padding: "10px 24px", fontWeight: 700, background: triggering ? undefined : "linear-gradient(135deg,#4f8cff,#3b5bdb)" }}
          >
            {triggering ? "Indítás…" : "▶ Manuális futtatás"}
          </button>
          {triggerResult && (
            <div style={{ fontSize: 12, textAlign: "right" }}>
              {triggerResult.run_id
                ? <span style={{ color: "#22c55e" }}>Futás létrehozva: <code style={{ fontSize: 11 }}>{triggerResult.run_id.slice(0, 8)}…</code></span>
                : <span style={{ color: "#ef4444" }}>{triggerResult.webhook_error}</span>
              }
              {triggerResult.webhook_called && <div className="muted">Webhook meghívva ✓</div>}
              {triggerResult.webhook_error && !triggerResult.webhook_called && (
                <div style={{ color: "#f59e0b" }}>Webhook: {triggerResult.webhook_error}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? "" : "secondary"}
              onClick={() => setTab(t)}
              style={{ width: "auto", padding: "7px 18px", fontSize: 13 }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── KONFIGURÁCIÓ ──────────────────────────────────────────────────── */}
      {tab === "config" && (
        <>
          <div className="card">
            <h3 style={{ margin: "0 0 14px" }}>Ütemezés</h3>
            <div className="row two" style={{ alignItems: "center", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={cfg.schedule_enabled ?? false}
                  onChange={(e) => setCfg((p) => ({ ...p, schedule_enabled: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: "#4f8cff", cursor: "pointer" }}
                />
                <span>Automatikus ütemezés engedélyezve</span>
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>Futás minden</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={cfg.schedule_value ?? 6}
                  onChange={(e) => setCfg((p) => ({ ...p, schedule_value: parseInt(e.target.value, 10) || 1 }))}
                  style={{ width: 72, textAlign: "center" }}
                  disabled={!cfg.schedule_enabled}
                />
                <select
                  value={cfg.schedule_type ?? "hours"}
                  onChange={(e) => setCfg((p) => ({ ...p, schedule_type: e.target.value as ScheduleType }))}
                  style={{ width: "auto" }}
                  disabled={!cfg.schedule_enabled}
                >
                  <option value="minutes">percenként</option>
                  <option value="hours">óránként</option>
                  <option value="days">naponta</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Az ütemezést az n8n workflow Schedule Trigger-je hajtja végre. A fenti értékeket az n8n workflow olvassa a konfigurációból. Webhook URL-t megadva a manuális gomb is értesíti az n8n-t.
              </p>
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 14px" }}>Keresési visszatekintési ablak</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="number"
                min={1}
                max={365}
                value={cfg.lookback_days ?? 30}
                onChange={(e) => setCfg((p) => ({ ...p, lookback_days: parseInt(e.target.value, 10) || 30 }))}
                style={{ width: 80, textAlign: "center" }}
              />
              <span className="muted" style={{ fontSize: 13 }}>nap visszamenőleg (max. 365, ajánlott: 30)</span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 14px" }}>Keresőmotorok</h3>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 12px", lineHeight: 1.6 }}>
              Jelöld be, melyik keresőmotorokat használja az n8n workflow. A tényleges API-hívásokat az n8n agent végzi az itt megadott listával.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {SEARCH_ENGINES.map((eng) => {
                const selected = (cfg.search_engines ?? []).includes(eng.id);
                return (
                  <label
                    key={eng.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      cursor: "pointer",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: `1px solid ${selected ? "rgba(79,140,255,0.4)" : "#233158"}`,
                      background: selected ? "rgba(79,140,255,0.08)" : "#1a2440",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleEngine(eng.id)}
                      style={{ width: 16, height: 16, accentColor: "#4f8cff", cursor: "pointer", marginTop: 2, flexShrink: 0 }}
                    />
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
            <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
              Ha megadod az n8n workflow Webhook Trigger URL-jét, a manuális indítás gomb ezt is meghívja a futás metaadataival (run_id, lookback_days, search_engines).
            </p>
            <input
              type="url"
              value={cfg.webhook_url ?? ""}
              onChange={(e) => setCfg((p) => ({ ...p, webhook_url: e.target.value }))}
              placeholder="https://your-n8n.example.com/webhook/news-scout"
            />
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 14px" }}>Megjegyzés</h3>
            <textarea
              value={cfg.notes ?? ""}
              onChange={(e) => setCfg((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Belső megjegyzés a konfigurációhoz…"
            />
          </div>

          <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => void saveConfig()}
              disabled={cfgSaving || cfgLoading}
              style={{ width: "auto", padding: "10px 28px" }}
            >
              {cfgSaving ? "Mentés…" : cfgLoading ? "Betöltés…" : "Konfiguráció mentése"}
            </button>
            {cfgMsg && (
              <span style={{ fontSize: 13, color: cfgMsg.ok ? "#22c55e" : "#ef4444" }}>
                {cfgMsg.text}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── FUTÁSOK ───────────────────────────────────────────────────────── */}
      {tab === "runs" && (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={runsStatusFilter}
                  onChange={(e) => setRunsStatusFilter(e.target.value)}
                  style={{ width: "auto" }}
                >
                  <option value="">Összes státusz</option>
                  <option value="queued">queued</option>
                  <option value="running">running</option>
                  <option value="completed">completed</option>
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
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Trigger</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Helyszínek</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Ellenőrzött</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Új forrás</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Találat</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Futás ID</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>
                      {runsLoading ? "Betöltés…" : "Még nincs futás naplózva."}
                    </td></tr>
                  )}
                  {runs.map((r) => (
                    <tr key={r.run_id} style={{ borderBottom: "1px solid #1a2440" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(r.started_at)}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmt(r.finished_at)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmtDuration(r.duration_ms)}</td>
                      <td style={{ padding: "6px 8px" }}>{statusChip(r.status)}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={CHIP("#9baacf", "#1a2440")}>{r.trigger_type}</span>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.total_locations.toLocaleString()}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.total_known_sources_checked.toLocaleString()}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: r.total_new_sources_found > 0 ? "#22c55e" : undefined }}>
                        {r.total_new_sources_found > 0 ? `+${r.total_new_sources_found}` : r.total_new_sources_found}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: r.total_sources_with_matches > 0 ? "#4f8cff" : undefined }}>
                        {r.total_sources_with_matches.toLocaleString()}
                      </td>
                      <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 10, color: "#9baacf" }}>
                        {r.run_id.slice(0, 8)}…
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
        </>
      )}

      {/* ── TABLE BROWSER (channels / scanlog / locations) ─────────────────── */}
      {activeBrowseTab && (
        <>
          {/* Filters */}
          <div className="card">
            <div className="row two" style={{ gap: 10 }}>
              <label>Város / település
                <input value={browseCity} onChange={(e) => setBrowseCity(e.target.value)} placeholder="pl. Budapest, Győr…" />
              </label>
              <label>Irányítószám
                <input value={browsePostcode} onChange={(e) => setBrowsePostcode(e.target.value)} placeholder="pl. 1013" />
              </label>
              <label>Megye
                <input value={browseCounty} onChange={(e) => setBrowseCounty(e.target.value)} placeholder="pl. Pest, Győr-Moson…" />
              </label>
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
                <button onClick={() => void loadBrowse(1)} disabled={browseLoading} style={{ width: "auto", padding: "8px 24px" }}>
                  {browseLoading ? "Betöltés…" : "Lekérés"}
                </button>
                <button className="secondary" onClick={() => { setBrowseCity(""); setBrowsePostcode(""); setBrowseCounty(""); setBrowseHadMatch(""); setBrowseActive(""); setBrowseData(null); }} style={{ width: "auto", padding: "8px 16px" }}>
                  Törlés
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {browseData && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  Összes: <strong>{browseData.total.toLocaleString()}</strong> · Oldal {browseData.page}/{browseData.totalPages}
                </span>
                <div className="chips">
                  <button className="secondary" disabled={browsePage <= 1 || browseLoading} onClick={() => void loadBrowse(browsePage - 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>← Előző</button>
                  <button className="secondary" disabled={browsePage >= browseData.totalPages || browseLoading} onClick={() => void loadBrowse(browsePage + 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Következő →</button>
                </div>
              </div>

              {/* ── Source channels table ── */}
              {channelTab && (
                <div style={{ overflowX: "auto" }}>
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
                          <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span title={row.source_name ?? ""}>{row.source_name ?? "—"}</span>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={CHIP("#9baacf", "#0f1630")}>{SOURCE_TYPE_LABELS[row.source_type] ?? row.source_type}</span>
                          </td>
                          <td style={{ padding: "6px 8px" }}>{row.city}</td>
                          <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{row.postcode}</td>
                          <td style={{ padding: "6px 8px" }}>{row.county_name ?? "—"}</td>
                          <td style={{ padding: "6px 8px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <a href={row.source_base_url} target="_blank" rel="noopener noreferrer" style={{ color: "#4f8cff", textDecoration: "none", fontSize: 11 }}>
                              {row.source_base_url}
                            </a>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                            <span style={{ color: row.confidence_score >= 0.9 ? "#22c55e" : row.confidence_score >= 0.7 ? "#f59e0b" : "#ef4444" }}>
                              {Number(row.confidence_score).toFixed(2)}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ color: row.active ? "#22c55e" : "#ef4444" }}>{row.active ? "✓" : "✗"}</span>
                          </td>
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "#9baacf", fontSize: 11 }}>{fmt(row.last_match_at)}</td>
                        </tr>
                      ))}
                      {browseData.rows.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>Nincs találat.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Scan log table ── */}
              {scanlogTab && (
                <div style={{ overflowX: "auto" }}>
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
                            {row.best_evidence_url ? (
                              <a href={row.best_evidence_url} target="_blank" rel="noopener noreferrer" style={{ color: "#4f8cff", fontSize: 11 }}>
                                {row.source_base_url}
                              </a>
                            ) : row.source_base_url}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ color: row.had_match ? "#22c55e" : "#9baacf" }}>
                              {row.had_match ? "✓ igen" : "✗ nem"}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.match_count_estimate ?? "—"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                            <span style={{ color: row.confidence_score >= 0.9 ? "#22c55e" : row.confidence_score >= 0.7 ? "#f59e0b" : "#ef4444" }}>
                              {Number(row.confidence_score).toFixed(2)}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px" }}>{statusChip(row.status)}</td>
                          <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#9baacf", fontSize: 11 }}>
                            {Array.isArray(row.matched_categories) ? row.matched_categories.join(", ") : "—"}
                          </td>
                        </tr>
                      ))}
                      {browseData.rows.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>Nincs találat.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Location registry table ── */}
              {locTab && (
                <div style={{ overflowX: "auto" }}>
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
                      {browseData.rows.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9baacf" }}>Nincs találat.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── ADATBÁZIS / MIGRATE ───────────────────────────────────────────── */}
      {tab === "migrate" && (
        <>
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
              <p className="muted" style={{ fontSize: 13 }}>
                {migrateLoading ? "Ellenőrzés folyamatban…" : "Kattints az Ellenőrzés gombra az állapot lekérdezéséhez."}
              </p>
            )}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Migrációs SQL</h3>
              <button className="secondary" onClick={() => setShowSql((v) => !v)} style={{ width: "auto", padding: "6px 16px", fontSize: 12 }}>
                {showSql ? "Elrejtés" : "Megmutatás"}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" }}>
              A táblák a <strong>geodata Supabase projektben</strong> kell legyenek (ahol az <code>osm_addresses</code> is van). Az alábbi SQL-t a Supabase SQL Editorban futtathatod. A migráció idempotens (<code>CREATE TABLE IF NOT EXISTS</code>).
            </p>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Fájl: <code>supabase/migrations/news_scout_tables.sql</code>
            </p>
            {showSql && (
              <pre style={{ marginTop: 12, background: "#0b1020", border: "1px solid #233158", borderRadius: 8, padding: 14, fontSize: 11, overflowX: "auto", maxHeight: 500, overflowY: "auto", color: "#eef3ff", lineHeight: 1.5 }}>
                {SQL_PREVIEW}
              </pre>
            )}
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 10px" }}>Architektúra összefoglaló</h3>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
              <strong>news_scan_runs</strong> – minden futás egy rekord; trigger: manuális vagy n8n schedule.<br />
              <strong>news_source_channels</strong> – forrásregiszter; city+postcode+canonical_url alapján egyedi; upsert logika.<br />
              <strong>news_source_scan_log</strong> – minden ellenőrzött forrás minden futáskor append-only napló.<br />
              <strong>location_registry</strong> – normalizált helyszínjegyzék aliasokkal (kerületi variánsok, ékezetes/ékezet nélküli).<br />
              <strong>news_scout_config</strong> – egyetlen konfiguráció-sor (schedule, keresőmotorok, lookback).<br /><br />
              <strong>Bemeneti tábla:</strong> <code>public.osm_addresses</code> (city, postcode) — ez már létezik a geodata projektben.<br />
              <strong>Supabase env vars:</strong> <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// Inline SQL preview shown in migrate tab (abbreviated for readability)
const SQL_PREVIEW = `-- Teljes SQL: supabase/migrations/news_scout_tables.sql
-- Fontos: a location_registry egyediségét CREATE UNIQUE INDEX oldja meg
-- (coalesce kifejezéssel), mert PostgreSQL CREATE TABLE UNIQUE clausejában
-- nem lehet függvényt / kifejezést használni.

create extension if not exists pgcrypto;

-- Enumok (csak ha még nem léteznek)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'news_source_type') then
    create type public.news_source_type as enum (
      'municipality','police','healthcare','utility','gazette_legal',
      'eu_funding','local_news','regional_news','authority','transport',
      'disaster_management','education_public','other_public_interest'
    );
  end if;
end$$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'news_scan_status') then
    create type public.news_scan_status as enum (
      'ok','no_match','error','skipped'
    );
  end if;
end$$;

create table if not exists public.news_scan_runs (
  run_id                      uuid primary key default gen_random_uuid(),
  started_at                  timestamptz not null default now(),
  finished_at                 timestamptz,
  scope_description           text,
  total_locations             integer not null default 0,
  total_known_sources_checked integer not null default 0,
  total_new_sources_found     integer not null default 0,
  total_sources_with_matches  integer not null default 0,
  status                      text not null default 'queued',
  trigger_type                text not null default 'manual',
  notes                       text,
  created_at                  timestamptz not null default now()
);

create table if not exists public.news_source_channels (
  id                        uuid primary key default gen_random_uuid(),
  county_name               text,
  city                      text not null,
  postcode                  text not null,
  normalized_city           text,
  source_name               text,
  source_type               public.news_source_type not null,
  source_base_url           text not null,
  canonical_source_base_url text not null,
  source_search_url         text,
  categories_supported      jsonb not null default '[]',
  discovery_method          text,
  first_seen_at             timestamptz not null default now(),
  last_seen_at              timestamptz not null default now(),
  last_match_at             timestamptz,
  active                    boolean not null default true,
  confidence_score          numeric(4,3) not null default 0.500
    check (confidence_score between 0 and 1),
  notes                     text,
  metadata                  jsonb not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- egyszerű oszlop alapú unique: CREATE TABLE-ben is működik
  constraint news_source_channels_unique_channel
    unique (city, postcode, canonical_source_base_url)
);

create table if not exists public.news_source_scan_log (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    uuid not null
    references public.news_scan_runs(run_id) on delete cascade,
  scanned_at                timestamptz not null default now(),
  county_name               text,
  city                      text not null,
  postcode                  text not null,
  source_channel_id         uuid
    references public.news_source_channels(id) on delete set null,
  source_base_url           text not null,
  canonical_source_base_url text,
  checked_for_last_30_days  boolean not null default true,
  had_match                 boolean not null default false,
  matched_categories        jsonb not null default '[]',
  match_count_estimate      integer,
  best_evidence_url         text,
  confidence_score          numeric(4,3) not null default 0.500
    check (confidence_score between 0 and 1),
  status                    public.news_scan_status not null default 'ok',
  error_message             text,
  metadata                  jsonb not null default '{}',
  created_at                timestamptz not null default now()
);

create table if not exists public.location_registry (
  id               uuid primary key default gen_random_uuid(),
  county_name      text,
  city             text not null,
  postcode         text not null,
  normalized_city  text,
  district_variant text,   -- NULL = nincs kerületvariáns
  search_aliases   jsonb not null default '[]',
  metadata         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
  -- NEM rakunk ide UNIQUE clauset, mert kifejezést nem tud kezelni!
);

-- Kifejezés alapú unique index (csak így lehet coalesce-t használni):
create unique index if not exists idx_location_registry_unique
  on public.location_registry (city, postcode, coalesce(district_variant, ''));

create table if not exists public.news_scout_config (
  id               uuid primary key default gen_random_uuid(),
  schedule_enabled boolean not null default false,
  schedule_type    text not null default 'hours'
    check (schedule_type in ('minutes','hours','days')),
  schedule_value   integer not null default 6,
  search_engines   jsonb not null default '["google","bing"]',
  lookback_days    integer not null default 30
    check (lookback_days between 1 and 365),
  webhook_url      text,
  notes            text,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Default konfig sor – WHERE NOT EXISTS, mert nincs unique constraint
-- (ON CONFLICT DO NOTHING conflict target nélkül nem működik itt)
insert into public.news_scout_config
  (schedule_enabled, schedule_type, schedule_value, search_engines, lookback_days)
select false, 'hours', 6, '["google","bing"]'::jsonb, 30
where not exists (select 1 from public.news_scout_config limit 1);

-- (+ indexek, triggerek, normalize_url_for_channel(), upsert_news_source_channel())
-- Teljes fájl: supabase/migrations/news_scout_tables.sql`;
