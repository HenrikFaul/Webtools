"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SUPPORTED_COUNTRIES,
  getCategoryGroups,
  getAllCategoryKeys,
} from "@/types/geodata";
import type {
  CategoryGroup,
  GeoFetchResponse,
  GeoLocalLoadProvider,
  GeoLocalLoadResponse,
  GeoMergeResponse,
  GeoProvider,
  GeoStatsResponse,
} from "@/types/geodata";

type Step = "select" | "download" | "review" | "merge" | "local";

interface FetchJob {
  provider: GeoProvider;
  country: string;
  category: string;
  categoryLabel: string;
  status: "pending" | "running" | "done" | "error";
  result?: GeoFetchResponse;
  error?: string;
}

interface ReviewRow {
  id: string;
  name: string | null;
  categories: string[];
  country_code: string;
  formatted_address: string | null;
  lat: number;
  lon: number;
  phone?: string | null;
  website?: string | null;
  url?: string | null;
  source_provider?: string;
  fetch_category?: string | null;
  [k: string]: unknown;
}

interface ReviewData { rows: ReviewRow[]; total: number; page: number; totalPages: number; }

/* ================================================================== */

export function GeoDataLab() {
  const [step, setStep] = useState<Step>("select");
  const [stats, setStats] = useState<GeoStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<GeoProvider>("geoapify");
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set(["HU"]));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const [fetchJobs, setFetchJobs] = useState<FetchJob[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [stopDownload, setStopDownload] = useState(false);

  const [reviewTable, setReviewTable] = useState("geoapify_pois");
  const [reviewCountry, setReviewCountry] = useState("");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [mergeProvider, setMergeProvider] = useState<GeoProvider>("geoapify");
  const [mergeCountry, setMergeCountry] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<GeoMergeResponse | null>(null);

  const [localProvider, setLocalProvider] = useState<GeoLocalLoadProvider>("all");
  const [localCountry, setLocalCountry] = useState("");
  const [localBatchSize, setLocalBatchSize] = useState(500);
  const [localMaxRetries, setLocalMaxRetries] = useState(5);
  const [localLoading, setLocalLoading] = useState(false);
  const [localResult, setLocalResult] = useState<GeoLocalLoadResponse | null>(null);

  const groups = useMemo(() => getCategoryGroups(selectedProvider), [selectedProvider]);
  const allKeys = useMemo(() => getAllCategoryKeys(groups), [groups]);

  /* ---------- Stats ---------- */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try { const r = await fetch("/api/geodata/stats"); setStats(await r.json() as GeoStatsResponse); } catch { /* */ }
    setStatsLoading(false);
  }, []);
  useEffect(() => { void loadStats(); }, [loadStats]);

  /* ---------- Selection helpers ---------- */
  const toggleCountry = (code: string) => {
    setSelectedCountries((p) => { const n = new Set(p); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  };

  const toggleCategory = (key: string) => {
    setSelectedCategories((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const toggleGroup = (group: CategoryGroup) => {
    const groupKeys = group.items.map((i) => i.key);
    const allSelected = groupKeys.every((k) => selectedCategories.has(k));
    setSelectedCategories((p) => {
      const n = new Set(p);
      if (allSelected) { groupKeys.forEach((k) => n.delete(k)); }
      else { groupKeys.forEach((k) => n.add(k)); }
      return n;
    });
  };

  const toggleAll = () => {
    const allSelected = allKeys.every((k) => selectedCategories.has(k));
    setSelectedCategories(allSelected ? new Set() : new Set(allKeys));
  };

  const isGroupChecked = (group: CategoryGroup) => group.items.every((i) => selectedCategories.has(i.key));
  const isGroupIndeterminate = (group: CategoryGroup) => {
    const some = group.items.some((i) => selectedCategories.has(i.key));
    const all = group.items.every((i) => selectedCategories.has(i.key));
    return some && !all;
  };
  const isAllChecked = allKeys.length > 0 && allKeys.every((k) => selectedCategories.has(k));
  const isAllIndeterminate = allKeys.some((k) => selectedCategories.has(k)) && !isAllChecked;

  /* ---------- Download ---------- */
  const startDownload = useCallback(async () => {
    const cats = Array.from(selectedCategories);
    const countries = Array.from(selectedCountries);
    const catMap: Record<string, string> = {};
    for (const g of groups) for (const i of g.items) catMap[i.key] = i.label;

    const jobs: FetchJob[] = [];
    for (const cc of countries) for (const cat of cats) {
      jobs.push({ provider: selectedProvider, country: cc, category: cat, categoryLabel: catMap[cat] ?? cat, status: "pending" });
    }

    setFetchJobs(jobs);
    setDownloading(true);
    setStopDownload(false);
    setStep("download");

    for (let i = 0; i < jobs.length; i++) {
      if (stopDownload) break;
      jobs[i] = { ...jobs[i], status: "running" };
      setFetchJobs([...jobs]);

      try {
        const res = await fetch("/api/geodata/fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: jobs[i].provider, countryCode: jobs[i].country, category: jobs[i].category }),
        });
        const json = (await res.json()) as GeoFetchResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        jobs[i] = { ...jobs[i], status: "done", result: json };
      } catch (err) {
        jobs[i] = { ...jobs[i], status: "error", error: err instanceof Error ? err.message : "Error" };
      }
      setFetchJobs([...jobs]);
    }
    setDownloading(false);
    void loadStats();
  }, [selectedProvider, selectedCountries, selectedCategories, stopDownload, loadStats, groups]);

  /* ---------- Review ---------- */
  const loadReview = useCallback(async (page = 1) => {
    setReviewLoading(true);
    const params = new URLSearchParams({ table: reviewTable, page: String(page), pageSize: "50" });
    if (reviewCountry) params.set("country", reviewCountry);
    if (reviewSearch) params.set("search", reviewSearch);
    try { const r = await fetch(`/api/geodata/review?${params}`); setReviewData(await r.json() as ReviewData); setReviewPage(page); } catch { /* */ }
    setReviewLoading(false);
  }, [reviewTable, reviewCountry, reviewSearch]);

  /* ---------- Merge ---------- */
  const runMerge = useCallback(async () => {
    setMerging(true);
    setMergeResult(null);
    try {
      const r = await fetch("/api/geodata/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: mergeProvider,
          countryCode: mergeCountry || undefined,
          batchSize: 1000,
          maxRetries: 5,
        }),
      });
      const json = (await r.json()) as GeoMergeResponse & { error?: string };
      if (!r.ok && !json.status) {
        setMergeResult({
          status: "FAILED",
          success: false,
          load_session_id: "n/a",
          provider: mergeProvider,
          countryCode: mergeCountry || undefined,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: [json.error ?? "HTTP " + r.status],
          retry_logs: [],
          raw_source_count: 0,
          expected_count: 0,
          found_count: 0,
          missing_count: 0,
          upserted: 0,
          failed: 0,
          duplicate_source_keys: 0,
          attempts: 0,
          duration_ms: 0,
        });
      } else {
        setMergeResult(json);
      }
      void loadStats();
    } catch (err) {
      setMergeResult({
        status: "FAILED",
        success: false,
        load_session_id: "n/a",
        provider: mergeProvider,
        countryCode: mergeCountry || undefined,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Merge failed"],
        retry_logs: [],
        raw_source_count: 0,
        expected_count: 0,
        found_count: 0,
        missing_count: 0,
        upserted: 0,
        failed: 0,
        duplicate_source_keys: 0,
        attempts: 0,
        duration_ms: 0,
      });
    }
    setMerging(false);
  }, [mergeProvider, mergeCountry, loadStats]);

  /* ---------- Local ETL ---------- */
  const runLocalLoad = useCallback(async () => {
    setLocalLoading(true);
    setLocalResult(null);
    try {
      const r = await fetch("/api/geodata/load-local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: localProvider,
          countryCode: localCountry || undefined,
          batchSize: localBatchSize,
          maxRetries: localMaxRetries,
        }),
      });
      const json = (await r.json()) as GeoLocalLoadResponse & { error?: string };
      if (!r.ok && !json.status) {
        setLocalResult({
          status: "FAILED",
          success: false,
          load_session_id: "n/a",
          provider: localProvider,
          countryCode: localCountry || undefined,
          expected_count: 0,
          found_count: 0,
          missing_count: 0,
          attempts: 0,
          upserted: 0,
          retry_logs: [],
          errors: [json.error ?? "HTTP " + r.status],
          duplicate_source_keys: 0,
          duration_ms: 0,
        });
      } else {
        setLocalResult(json);
      }
      void loadStats();
    } catch (err) {
      setLocalResult({
        status: "FAILED",
        success: false,
        load_session_id: "n/a",
        provider: localProvider,
        countryCode: localCountry || undefined,
        expected_count: 0,
        found_count: 0,
        missing_count: 0,
        attempts: 0,
        upserted: 0,
        retry_logs: [],
        errors: [err instanceof Error ? err.message : "Local ETL failed"],
        duplicate_source_keys: 0,
        duration_ms: 0,
      });
    }
    setLocalLoading(false);
  }, [localProvider, localCountry, localBatchSize, localMaxRetries, loadStats]);

  /* ---------- Derived ---------- */
  const countryName = (c: string) => SUPPORTED_COUNTRIES.find((x) => x.code === c)?.name ?? c;
  const doneJobs = fetchJobs.filter((j) => j.status === "done");
  const errorJobs = fetchJobs.filter((j) => j.status === "error");
  const totalInserted = doneJobs.reduce((s, j) => s + (j.result?.inserted ?? 0), 0);
  const totalFromApi = doneJobs.reduce((s, j) => s + (j.result?.total ?? 0), 0);

  /* ---- Checkbox style helpers ---- */
  const cbStyle: React.CSSProperties = { width: 16, height: 16, accentColor: "#4f8cff", cursor: "pointer", flexShrink: 0 };
  const groupBg = (checked: boolean): string => checked ? "rgba(79,140,255,0.12)" : "rgba(15,22,48,0.5)";

  /* ================================================================ */
  return (
    <section style={{ display: "grid", gap: 16 }}>

      {/* ---- Stats ---- */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Adatbázis statisztika</h3>
          <button className="secondary" onClick={() => void loadStats()} disabled={statsLoading} style={{ width: "auto", padding: "6px 16px", fontSize: 12 }}>
            {statsLoading ? "…" : "Frissítés"}
          </button>
        </div>
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
            {[
              { v: stats.geoapify_count, l: "Geoapify POI", c: "#22c55e" },
              { v: stats.tomtom_count, l: "TomTom POI", c: "#3b82f6" },
              { v: stats.unified_count, l: "Egyesített POI", c: "#f59e0b" },
              { v: stats.local_count ?? 0, l: "Local POI", c: "#a78bfa" },
            ].map((s) => (
              <div key={s.l} style={{ background: "#1a2440", borderRadius: 10, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.c }}>{s.v.toLocaleString()}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Steps ---- */}
      <div className="card">
        <div className="chips">
          {(["select", "download", "review", "merge", "local"] as Step[]).map((s, i) => (
            <button key={s} className={step === s ? "" : "secondary"} onClick={() => setStep(s)} style={{ padding: "8px 20px", width: "auto" }}>
              {i + 1}. {["Kiválasztás", "Letöltés", "Ellenőrzés", "Egyesítés", "Local ETL"][i]}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/*  STEP 1                                                          */}
      {/* ================================================================ */}
      {step === "select" && (<>
        {/* Provider */}
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>Szolgáltató</h3>
          <div className="chips">
            {(["geoapify", "tomtom"] as GeoProvider[]).map((p) => (
              <button key={p} className={selectedProvider === p ? "" : "secondary"} onClick={() => { setSelectedProvider(p); setSelectedCategories(new Set()); }} style={{ width: "auto", padding: "8px 24px", textTransform: "capitalize" }}>
                {p === "geoapify" ? "Geoapify" : "TomTom"}
              </button>
            ))}
          </div>
        </div>

        {/* Countries */}
        <div className="card">
          <h3 style={{ margin: "0 0 10px" }}>Országok</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SUPPORTED_COUNTRIES.map((c) => (
              <label key={c.code} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, background: selectedCountries.has(c.code) ? "rgba(79,140,255,0.15)" : "#1a2440", padding: "6px 12px", borderRadius: 8 }}>
                <input type="checkbox" checked={selectedCountries.has(c.code)} onChange={() => toggleCountry(c.code)} style={cbStyle} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        {/* Categories with group checkboxes */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, borderBottom: "1px solid #233158", paddingBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Kategóriák ({selectedProvider})</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: isAllChecked ? "#4f8cff" : "#9baacf" }}>
              <input
                type="checkbox"
                checked={isAllChecked}
                ref={(el) => { if (el) el.indeterminate = isAllIndeterminate; }}
                onChange={toggleAll}
                style={{ ...cbStyle, width: 18, height: 18 }}
              />
              Összes kijelölése
            </label>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((group) => {
              const gc = isGroupChecked(group);
              const gi = isGroupIndeterminate(group);
              return (
                <div key={group.groupKey} style={{ background: groupBg(gc), border: "1px solid #233158", borderRadius: 10, padding: "10px 14px" }}>
                  {/* Group header with checkbox */}
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={gc}
                      ref={(el) => { if (el) el.indeterminate = gi; }}
                      onChange={() => toggleGroup(group)}
                      style={{ ...cbStyle, width: 17, height: 17 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600, color: gc ? "#eef3ff" : "#9baacf" }}>{group.groupLabel}</span>
                    <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                      {group.items.filter((i) => selectedCategories.has(i.key)).length}/{group.items.length}
                    </span>
                  </label>
                  {/* Items */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 27 }}>
                    {group.items.map((item) => (
                      <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, background: selectedCategories.has(item.key) ? "rgba(34,197,94,0.18)" : "#0f1630", padding: "4px 10px", borderRadius: 6, border: `1px solid ${selectedCategories.has(item.key) ? "rgba(34,197,94,0.4)" : "#233158"}`, transition: "all 0.15s" }}>
                        <input type="checkbox" checked={selectedCategories.has(item.key)} onChange={() => toggleCategory(item.key)} style={cbStyle} />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Start */}
        <div className="card">
          <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
            <strong>{selectedCountries.size}</strong> ország × <strong>{selectedCategories.size}</strong> kategória = <strong>{selectedCountries.size * selectedCategories.size}</strong> API lekérés ({selectedProvider}) — NINCS limit, az összes POI letöltésre kerül.
          </p>
          <button onClick={() => void startDownload()} disabled={selectedCategories.size === 0 || selectedCountries.size === 0}>
            Letöltés indítása
          </button>
        </div>
      </>)}

      {/* ================================================================ */}
      {/*  STEP 2                                                          */}
      {/* ================================================================ */}
      {step === "download" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Letöltés folyamata</h3>
            {downloading && <button className="secondary" onClick={() => setStopDownload(true)} style={{ width: "auto", padding: "6px 16px" }}>Leállítás</button>}
          </div>

          {fetchJobs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ background: "#1a2440", borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg,#22c55e,#3b82f6)", height: "100%", width: `${((doneJobs.length + errorJobs.length) / fetchJobs.length) * 100}%`, transition: "width 0.3s" }} />
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                <span className="chip" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>✓ {doneJobs.length} kész</span>
                {errorJobs.length > 0 && <span className="chip" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>✗ {errorJobs.length} hiba</span>}
                <span className="chip">API-ról jött: {totalFromApi.toLocaleString()}</span>
                <span className="chip">DB-be írva: {totalInserted.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div style={{ maxHeight: 450, overflow: "auto" }}>
            {fetchJobs.map((job, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderBottom: "1px solid #1a2440", fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: job.status === "done" ? "#22c55e" : job.status === "running" ? "#f59e0b" : job.status === "error" ? "#ef4444" : "#475569", animation: job.status === "running" ? "pulse 1s infinite" : undefined }} />
                <span style={{ flex: 1 }}>{countryName(job.country)}</span>
                <span className="muted" style={{ flex: 1 }}>{job.categoryLabel}</span>
                <span style={{ width: 100, textAlign: "right", fontSize: 11, color: job.status === "error" ? "#ef4444" : "#9baacf" }}>
                  {job.status === "done" && `+${job.result?.inserted ?? 0} (${job.result?.total ?? 0})`}
                  {job.status === "running" && "letöltés…"}
                  {job.status === "error" && "HIBA"}
                  {job.status === "pending" && "—"}
                </span>
              </div>
            ))}
          </div>

          {!downloading && fetchJobs.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setStep("review")}>Tovább az ellenőrzéshez →</button>
            </div>
          )}
          <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
        </div>
      )}

      {/* ================================================================ */}
      {/*  STEP 3                                                          */}
      {/* ================================================================ */}
      {step === "review" && (<>
        <div className="card row two">
          <label>Tábla
            <select value={reviewTable} onChange={(e) => { setReviewTable(e.target.value); setReviewData(null); }}>
              <option value="geoapify_pois">Geoapify POI-k</option>
              <option value="tomtom_pois">TomTom POI-k</option>
              <option value="unified_pois">Egyesített POI-k</option>
              <option value="local_pois">Local POI-k</option>
            </select>
          </label>
          <label>Ország
            <select value={reviewCountry} onChange={(e) => setReviewCountry(e.target.value)}>
              <option value="">Mind</option>
              {SUPPORTED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>Keresés név szerint
            <input value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} placeholder="Pl: Hilton, Balaton…" />
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button onClick={() => void loadReview(1)} disabled={reviewLoading}>{reviewLoading ? "Betöltés…" : "Lekérés"}</button>
          </div>
        </div>
        {reviewData && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>Összesen: <strong>{reviewData.total.toLocaleString()}</strong> rekord · Oldal {reviewData.page}/{reviewData.totalPages}</span>
              <div className="chips">
                <button className="secondary" disabled={reviewPage <= 1} onClick={() => void loadReview(reviewPage - 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>← Előző</button>
                <button className="secondary" disabled={reviewPage >= reviewData.totalPages} onClick={() => void loadReview(reviewPage + 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Következő →</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "2px solid #233158" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Név</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Ország</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Cím</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Kategóriák</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Lat</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Lon</th>
                  {(reviewTable === "unified_pois" || reviewTable === "local_pois") && <th style={{ padding: "6px 8px", textAlign: "left" }}>Forrás</th>}
                </tr></thead>
                <tbody>
                  {reviewData.rows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #1a2440" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 500 }}>{row.name ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.country_code}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.formatted_address ?? "—"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(row.categories ?? []).slice(0, 3).join(", ")}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.lat?.toFixed(4)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.lon?.toFixed(4)}</td>
                      {(reviewTable === "unified_pois" || reviewTable === "local_pois") && <td style={{ padding: "6px 8px" }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: row.source_provider === "geoapify" ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)", color: row.source_provider === "geoapify" ? "#22c55e" : "#3b82f6" }}>
                          {row.source_provider}
                        </span>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>)}

      {/* ================================================================ */}
      {/*  STEP 4                                                          */}
      {/* ================================================================ */}
      {step === "merge" && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Egyesítés – áttöltés a közös címtáblába</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
            Az összes mezőt átmásolja az egyesített táblába. Meglévő rekordokból csak a hiányzó adatokat pótolja — nem ír felül, nem duplikál. A <strong>forrás (source_provider)</strong> oszlop jelzi az eredetét.
          </p>
          <div className="row two">
            <label>Forrás szolgáltató
              <select value={mergeProvider} onChange={(e) => setMergeProvider(e.target.value as GeoProvider)}>
                <option value="geoapify">Geoapify</option>
                <option value="tomtom">TomTom</option>
              </select>
            </label>
            <label>Ország (üres = mind)
              <select value={mergeCountry} onChange={(e) => setMergeCountry(e.target.value)}>
                <option value="">Összes ország</option>
                {SUPPORTED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => void runMerge()} disabled={merging}>{merging ? "Egyesítés folyamatban…" : "Egyesítés indítása"}</button>
          </div>
          {mergeResult && (
            <div style={{ marginTop: 12, padding: 12, background: "#1a2440", borderRadius: 10 }}>
              <div className="chips">
                <span className="chip" style={{ background: mergeResult.success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", color: mergeResult.success ? "#22c55e" : "#ef4444" }}>{mergeResult.status}</span>
                <span className="chip">Raw source: {mergeResult.raw_source_count.toLocaleString()}</span>
                <span className="chip">Expected distinct: {mergeResult.expected_count.toLocaleString()}</span>
                <span className="chip">Found: {mergeResult.found_count.toLocaleString()}</span>
                <span className="chip">Missing: {mergeResult.missing_count.toLocaleString()}</span>
                <span className="chip">Session: {mergeResult.load_session_id}</span>
                <span className="chip" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>+{mergeResult.inserted.toLocaleString()} beszúrva</span>
                <span className="chip" style={{ background: "rgba(59,130,246,0.2)", color: "#3b82f6" }}>↻ {mergeResult.updated.toLocaleString()} frissítve</span>
                <span className="chip">⊘ {mergeResult.skipped.toLocaleString()} kihagyva</span>
              </div>
              {mergeResult.duplicate_source_keys > 0 && (
                <div style={{ marginTop: 8, color: "#f59e0b", fontSize: 12 }}>
                  Duplikált forráskulcsok: {mergeResult.duplicate_source_keys.toLocaleString()} — a validáció distinct provider/source kulcsokra történik.
                </div>
              )}
              {mergeResult.errors.length > 0 && (
                <div style={{ marginTop: 8, color: "#ef4444", fontSize: 12 }}>
                  {mergeResult.errors.slice(0, 8).map((e, i) => <div key={i}>• {e}</div>)}
                  {mergeResult.errors.length > 8 && <div>…és még {mergeResult.errors.length - 8} hiba</div>}
                </div>
              )}
              <div className="pre" style={{ marginTop: 10, maxHeight: 220 }}>
                {mergeResult.retry_logs.length > 0 ? mergeResult.retry_logs.join("\n") : "Nincs részletes merge log."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/*  STEP 5                                                          */}
      {/* ================================================================ */}
      {step === "local" && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Self-healing ETL – unified_pois → local_pois</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.6 }}>
            Ez a lépés minden futáskor új <code>load_session_id</code>-t generál, UPSERT-tel ír a <code>local_pois</code> táblába, majd a <code>last_load_session</code> alapján visszaellenőrzi a darabszámot. Zöld státusz csak akkor jelenik meg, ha a forrás és cél darabszám pontosan egyezik.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span
              aria-label="ETL státuszlámpa"
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                flexShrink: 0,
                background: localLoading ? "#f59e0b" : localResult?.success ? "#22c55e" : localResult ? "#ef4444" : "#64748b",
                boxShadow: localLoading ? "0 0 16px rgba(245,158,11,0.8)" : localResult?.success ? "0 0 16px rgba(34,197,94,0.8)" : localResult ? "0 0 16px rgba(239,68,68,0.8)" : "none",
                animation: localLoading ? "pulse 1s infinite" : undefined,
              }}
            />
            <strong>
              {localLoading ? "Fut / narancs" : localResult?.success ? "SUCCESS / zöld" : localResult ? "FAILED / piros" : "Még nem futott"}
            </strong>
          </div>

          <div className="row two">
            <label>Forrás
              <select value={localProvider} onChange={(e) => setLocalProvider(e.target.value as GeoLocalLoadProvider)}>
                <option value="all">Geoapify + TomTom</option>
                <option value="geoapify">Csak Geoapify</option>
                <option value="tomtom">Csak TomTom</option>
              </select>
            </label>
            <label>Ország (üres = mind)
              <select value={localCountry} onChange={(e) => setLocalCountry(e.target.value)}>
                <option value="">Összes ország</option>
                {SUPPORTED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <label>Chunk méret
              <input
                type="number"
                min={100}
                max={1000}
                step={100}
                value={localBatchSize}
                onChange={(e) => setLocalBatchSize(Number(e.target.value))}
              />
            </label>
            <label>Maximum retry
              <input
                type="number"
                min={1}
                max={10}
                value={localMaxRetries}
                onChange={(e) => setLocalMaxRetries(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={() => void runLocalLoad()} disabled={localLoading}>
              {localLoading ? "ETL fut, ellenőrzés folyamatban…" : "Self-healing ETL indítása"}
            </button>
          </div>

          {localResult && (
            <div style={{ marginTop: 12, padding: 12, background: "#1a2440", borderRadius: 10 }}>
              <div className="chips">
                <span className="chip" style={{ background: localResult.success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", color: localResult.success ? "#22c55e" : "#ef4444" }}>{localResult.status}</span>
                <span className="chip">Expected: {localResult.expected_count.toLocaleString()}</span>
                <span className="chip">Found: {localResult.found_count.toLocaleString()}</span>
                <span className="chip">Missing: {localResult.missing_count.toLocaleString()}</span>
                <span className="chip">Attempts: {localResult.attempts}</span>
                <span className="chip">Session: {localResult.load_session_id}</span>
              </div>

              {localResult.errors.length > 0 && (
                <div style={{ marginTop: 10, color: "#ef4444", fontSize: 12, lineHeight: 1.5 }}>
                  {localResult.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}

              <div className="pre" style={{ marginTop: 10, maxHeight: 260 }}>
                {localResult.retry_logs.length > 0 ? localResult.retry_logs.join("\n") : "Nincs részletes log."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Info ---- */}
      {step === "select" && (
        <div className="card">
          <h3 style={{ margin: "0 0 8px" }}>Hogyan működik?</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <strong>1.</strong> Válaszd ki a szolgáltatót, országo(ka)t, és a kategóriákat (csoportonként vagy egyenként).<br />
            <strong>2.</strong> A rendszer az API-ról az <em>összes</em> POI-t letölti — nincs mesterséges limit.<br />
            <strong>3.</strong> Ellenőrizd a letöltött címeket a harmadik fülön szűréssel/lapozással.<br />
            <strong>4.</strong> Egyesítsd a közös címtáblába — a rendszer nem duplikál, csak hiányzó mezőket pótol.<br />
            <strong>5.</strong> Futtasd a self-healing ETL-t a <code>local_pois</code> táblába; zöld siker csak validált darabszám-egyezés után jár.<br /><br />
            <strong>Env vars:</strong> <code>GEOAPIFY_API_KEY</code>, <code>TOMTOM_API_KEY</code>, <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>
          </div>
        </div>
      )}
    </section>
  );
}
