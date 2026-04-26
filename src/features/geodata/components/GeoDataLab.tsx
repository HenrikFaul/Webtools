"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GEOAPIFY_TOURISM_CATEGORIES,
  SUPPORTED_COUNTRIES,
  TOMTOM_TOURISM_CATEGORIES,
} from "@/types/geodata";
import type {
  GeoFetchResponse,
  GeoMergeResponse,
  GeoProvider,
  GeoStatsResponse,
} from "@/types/geodata";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Step = "select" | "download" | "review" | "merge";

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
  fetched_at?: string;
  unified_at?: string;
  fetch_category?: string | null;
}

interface ReviewData {
  rows: ReviewRow[];
  total: number;
  page: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function GeoDataLab() {
  const [step, setStep] = useState<Step>("select");
  const [stats, setStats] = useState<GeoStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Selection state
  const [selectedProvider, setSelectedProvider] = useState<GeoProvider>("geoapify");
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set(["HU"]));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  // Download state
  const [fetchJobs, setFetchJobs] = useState<FetchJob[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [stopDownload, setStopDownload] = useState(false);

  // Review state
  const [reviewTable, setReviewTable] = useState<string>("geoapify_pois");
  const [reviewCountry, setReviewCountry] = useState("");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Merge state
  const [mergeProvider, setMergeProvider] = useState<GeoProvider>("geoapify");
  const [mergeCountry, setMergeCountry] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<GeoMergeResponse | null>(null);

  /* ---------- Load stats ---------- */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/geodata/stats");
      const json = (await res.json()) as GeoStatsResponse;
      setStats(json);
    } catch { /* ignore */ }
    setStatsLoading(false);
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  /* ---------- Toggle helpers ---------- */
  function toggleCountry(code: string) {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function toggleCategory(key: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function selectAllCategories() {
    if (selectedProvider === "geoapify") {
      const all = GEOAPIFY_TOURISM_CATEGORIES.flatMap((g) => g.subcategories.map((s) => s.key));
      setSelectedCategories(new Set(all));
    } else {
      setSelectedCategories(new Set(TOMTOM_TOURISM_CATEGORIES.map((c) => c.key)));
    }
  }

  /* ---------- Build & run jobs ---------- */
  const startDownload = useCallback(async () => {
    const cats = Array.from(selectedCategories);
    const countries = Array.from(selectedCountries);

    // Build flat job list
    const catLabels: Record<string, string> = {};
    if (selectedProvider === "geoapify") {
      for (const g of GEOAPIFY_TOURISM_CATEGORIES) {
        for (const s of g.subcategories) catLabels[s.key] = s.label;
      }
    } else {
      for (const c of TOMTOM_TOURISM_CATEGORIES) catLabels[c.key] = c.label;
    }

    const jobs: FetchJob[] = [];
    for (const cc of countries) {
      for (const cat of cats) {
        jobs.push({
          provider: selectedProvider,
          country: cc,
          category: cat,
          categoryLabel: catLabels[cat] ?? cat,
          status: "pending",
        });
      }
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
          body: JSON.stringify({
            provider: jobs[i].provider,
            countryCode: jobs[i].country,
            category: jobs[i].category,
          }),
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
  }, [selectedProvider, selectedCountries, selectedCategories, stopDownload, loadStats]);

  /* ---------- Review ---------- */
  const loadReview = useCallback(async (page = 1) => {
    setReviewLoading(true);
    try {
      const params = new URLSearchParams({
        table: reviewTable,
        page: String(page),
        pageSize: "50",
      });
      if (reviewCountry) params.set("country", reviewCountry);
      if (reviewSearch) params.set("search", reviewSearch);

      const res = await fetch(`/api/geodata/review?${params}`);
      const json = (await res.json()) as ReviewData;
      setReviewData(json);
      setReviewPage(page);
    } catch { /* ignore */ }
    setReviewLoading(false);
  }, [reviewTable, reviewCountry, reviewSearch]);

  /* ---------- Merge ---------- */
  const runMerge = useCallback(async () => {
    setMerging(true);
    setMergeResult(null);
    try {
      const res = await fetch("/api/geodata/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: mergeProvider,
          countryCode: mergeCountry || undefined,
        }),
      });
      const json = (await res.json()) as GeoMergeResponse;
      setMergeResult(json);
      void loadStats();
    } catch { /* ignore */ }
    setMerging(false);
  }, [mergeProvider, mergeCountry, loadStats]);

  /* ---------- Helpers ---------- */
  const countryName = (code: string) =>
    SUPPORTED_COUNTRIES.find((c) => c.code === code)?.name ?? code;

  const doneJobs = fetchJobs.filter((j) => j.status === "done");
  const errorJobs = fetchJobs.filter((j) => j.status === "error");
  const totalInserted = doneJobs.reduce((s, j) => s + (j.result?.inserted ?? 0), 0);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <section style={{ display: "grid", gap: 16 }}>

      {/* ---- Stats dashboard ---- */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Adatbázis statisztika</h3>
          <button className="secondary" onClick={() => void loadStats()} disabled={statsLoading} style={{ width: "auto", padding: "6px 16px", fontSize: 12 }}>
            {statsLoading ? "Betöltés…" : "Frissítés"}
          </button>
        </div>
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
            <div style={{ background: "#1a2440", borderRadius: 10, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{stats.geoapify_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>Geoapify POI</div>
            </div>
            <div style={{ background: "#1a2440", borderRadius: 10, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>{stats.tomtom_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>TomTom POI</div>
            </div>
            <div style={{ background: "#1a2440", borderRadius: 10, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>{stats.unified_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>Egyesített POI</div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Step navigation ---- */}
      <div className="card">
        <div className="chips">
          {(["select", "download", "review", "merge"] as Step[]).map((s) => (
            <button
              key={s}
              className={step === s ? "" : "secondary"}
              onClick={() => setStep(s)}
              style={{ padding: "8px 20px", width: "auto" }}
            >
              {s === "select" && "1. Kiválasztás"}
              {s === "download" && "2. Letöltés"}
              {s === "review" && "3. Ellenőrzés"}
              {s === "merge" && "4. Egyesítés"}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/*  STEP 1: Selection                                               */}
      {/* ================================================================ */}
      {step === "select" && (
        <>
          {/* Provider */}
          <div className="card">
            <h3 style={{ margin: "0 0 10px" }}>Szolgáltató</h3>
            <div className="chips">
              <button className={selectedProvider === "geoapify" ? "" : "secondary"} onClick={() => { setSelectedProvider("geoapify"); setSelectedCategories(new Set()); }} style={{ width: "auto", padding: "8px 20px" }}>
                Geoapify
              </button>
              <button className={selectedProvider === "tomtom" ? "" : "secondary"} onClick={() => { setSelectedProvider("tomtom"); setSelectedCategories(new Set()); }} style={{ width: "auto", padding: "8px 20px" }}>
                TomTom
              </button>
            </div>
          </div>

          {/* Countries */}
          <div className="card">
            <h3 style={{ margin: "0 0 10px" }}>Országok</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUPPORTED_COUNTRIES.map((c) => (
                <label key={c.code} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, background: selectedCountries.has(c.code) ? "rgba(79,140,255,0.15)" : "#1a2440", padding: "6px 12px", borderRadius: 8 }}>
                  <input type="checkbox" checked={selectedCountries.has(c.code)} onChange={() => toggleCountry(c.code)} style={{ width: 14 }} />
                  {c.name} ({c.code})
                </label>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Kategóriák ({selectedProvider})</h3>
              <div className="chips">
                <button className="secondary" onClick={selectAllCategories} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Összes kijelölése</button>
                <button className="secondary" onClick={() => setSelectedCategories(new Set())} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Összes törlése</button>
              </div>
            </div>

            {selectedProvider === "geoapify" ? (
              GEOAPIFY_TOURISM_CATEGORIES.map((group) => (
                <div key={group.key} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#9baacf", marginBottom: 4 }}>{group.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {group.subcategories.map((sub) => (
                      <label key={sub.key} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12, background: selectedCategories.has(sub.key) ? "rgba(34,197,94,0.15)" : "#0f1630", padding: "4px 10px", borderRadius: 6, border: "1px solid #233158" }}>
                        <input type="checkbox" checked={selectedCategories.has(sub.key)} onChange={() => toggleCategory(sub.key)} style={{ width: 12 }} />
                        {sub.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TOMTOM_TOURISM_CATEGORIES.map((cat) => (
                  <label key={cat.key} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12, background: selectedCategories.has(cat.key) ? "rgba(34,197,94,0.15)" : "#0f1630", padding: "4px 10px", borderRadius: 6, border: "1px solid #233158" }}>
                    <input type="checkbox" checked={selectedCategories.has(cat.key)} onChange={() => toggleCategory(cat.key)} style={{ width: 12 }} />
                    {cat.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Start */}
          <div className="card">
            <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
              Kiválasztva: <strong>{selectedCountries.size}</strong> ország, <strong>{selectedCategories.size}</strong> kategória
              = <strong>{selectedCountries.size * selectedCategories.size}</strong> lekérés ({selectedProvider})
            </p>
            <button onClick={() => void startDownload()} disabled={selectedCategories.size === 0 || selectedCountries.size === 0}>
              Letöltés indítása
            </button>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/*  STEP 2: Download progress                                       */}
      {/* ================================================================ */}
      {step === "download" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Letöltés folyamata</h3>
            {downloading && (
              <button className="secondary" onClick={() => setStopDownload(true)} style={{ width: "auto", padding: "6px 16px" }}>Leállítás</button>
            )}
          </div>

          {/* Progress bar */}
          {fetchJobs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ background: "#1a2440", borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{
                  background: "linear-gradient(90deg, #22c55e, #3b82f6)",
                  height: "100%",
                  width: `${((doneJobs.length + errorJobs.length) / fetchJobs.length) * 100}%`,
                  transition: "width 0.3s"
                }} />
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                <span className="chip" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>✓ {doneJobs.length} kész</span>
                {errorJobs.length > 0 && <span className="chip" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>✗ {errorJobs.length} hiba</span>}
                <span className="chip">Össz: {totalInserted} POI beszúrva</span>
              </div>
            </div>
          )}

          {/* Job list */}
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {fetchJobs.map((job, idx) => (
              <div key={idx} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderBottom: "1px solid #1a2440", fontSize: 13
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: job.status === "done" ? "#22c55e" : job.status === "running" ? "#f59e0b" : job.status === "error" ? "#ef4444" : "#475569",
                  animation: job.status === "running" ? "pulse 1s infinite" : undefined,
                }} />
                <span style={{ flex: 1 }}>{countryName(job.country)}</span>
                <span className="muted" style={{ flex: 1 }}>{job.categoryLabel}</span>
                <span style={{ width: 80, textAlign: "right", fontSize: 11, color: job.status === "error" ? "#ef4444" : "#9baacf" }}>
                  {job.status === "done" && `+${job.result?.inserted ?? 0}`}
                  {job.status === "running" && "…"}
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
      {/*  STEP 3: Review                                                  */}
      {/* ================================================================ */}
      {step === "review" && (
        <>
          <div className="card row two">
            <label>Tábla
              <select value={reviewTable} onChange={(e) => { setReviewTable(e.target.value); setReviewData(null); }}>
                <option value="geoapify_pois">Geoapify POI-k</option>
                <option value="tomtom_pois">TomTom POI-k</option>
                <option value="unified_pois">Egyesített POI-k</option>
              </select>
            </label>
            <label>Ország szűrő
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
                <span className="muted" style={{ fontSize: 13 }}>
                  Összesen: <strong>{reviewData.total}</strong> rekord · Oldal {reviewData.page}/{reviewData.totalPages}
                </span>
                <div className="chips">
                  <button className="secondary" disabled={reviewPage <= 1} onClick={() => void loadReview(reviewPage - 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>← Előző</button>
                  <button className="secondary" disabled={reviewPage >= reviewData.totalPages} onClick={() => void loadReview(reviewPage + 1)} style={{ width: "auto", padding: "4px 12px", fontSize: 11 }}>Következő →</button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #233158" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Név</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Ország</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Cím</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Kategóriák</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Lat</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Lon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewData.rows.map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #1a2440" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 500 }}>{row.name ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{row.country_code}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.formatted_address ?? "—"}</td>
                        <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(row.categories ?? []).slice(0, 3).join(", ")}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.lat.toFixed(4)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.lon.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/*  STEP 4: Merge to unified                                        */}
      {/* ================================================================ */}
      {step === "merge" && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Egyesítés – átmásolás a közös címtáblába</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
            A kiválasztott szolgáltató és ország címadatait átmásolja az egyesített (unified_pois) táblába.
            Már meglévő rekordokat nem ír felül, csak a hiányzó mezőket pótolja.
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
            <button onClick={() => void runMerge()} disabled={merging}>
              {merging ? "Egyesítés folyamatban…" : "Egyesítés indítása"}
            </button>
          </div>

          {mergeResult && (
            <div style={{ marginTop: 12, padding: 12, background: "#1a2440", borderRadius: 10 }}>
              <div className="chips">
                <span className="chip" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>+{mergeResult.inserted} beszúrva</span>
                <span className="chip" style={{ background: "rgba(59,130,246,0.2)", color: "#3b82f6" }}>↻ {mergeResult.updated} frissítve</span>
                <span className="chip">⊘ {mergeResult.skipped} kihagyva</span>
              </div>
              {mergeResult.errors.length > 0 && (
                <div style={{ marginTop: 8, color: "#ef4444", fontSize: 12 }}>
                  {mergeResult.errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                  {mergeResult.errors.length > 5 && <div>…és még {mergeResult.errors.length - 5} hiba</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Info card ---- */}
      {step === "select" && (
        <div className="card">
          <h3 style={{ margin: "0 0 8px" }}>Hogyan működik?</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <strong>1. Kiválasztás:</strong> Válaszd ki a szolgáltatót (Geoapify/TomTom), az országo(ka)t és a turisztikai kategóriákat.<br />
            <strong>2. Letöltés:</strong> A rendszer végigmegy minden ország+kategória kombináción és az API-ról letölti a POI-kat a szolgáltató-specifikus táblába.<br />
            <strong>3. Ellenőrzés:</strong> Az Ellenőrzés fülön böngészheted és szűrheted a letöltött címadatokat.<br />
            <strong>4. Egyesítés:</strong> Az Egyesítés gombbal áttöltheted az adatokat a közös egyesített címtáblába (unified_pois), amelyet más webalkalmazásaid felé kiajánlhatsz. A rendszer nem duplikál — a már meglévő rekordokból csak a hiányzó adatmezőket pótolja.<br /><br />
            <strong>Szükséges env vars:</strong> <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>GEOAPIFY_API_KEY</code>, <code>TOMTOM_API_KEY</code>
          </div>
        </div>
      )}
    </section>
  );
}
