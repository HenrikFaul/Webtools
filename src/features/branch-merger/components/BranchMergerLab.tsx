"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiMergeResponse,
  BranchFile,
  DiffAnalysis,
  DiffPair,
  MergeFileResult,
  MergeSession,
  UniqueFile
} from "@/types/branchMerger";
import { CHARS_PER_TOKEN, MAX_TOKENS_PER_FILE } from "@/types/branchMerger";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Detect the two top-level folders inside the ZIP as main / feature. */
function detectBranches(paths: string[]): { mainPrefix: string; featurePrefix: string } | null {
  const topFolders = new Set<string>();
  for (const p of paths) {
    const first = p.split("/")[0];
    if (first) topFolders.add(first);
  }
  const sorted = Array.from(topFolders).sort();
  if (sorted.length < 2) return null;

  // Heuristic: folder containing "main" in name is main, else alphabetically first
  const mainIdx = sorted.findIndex((f) => /main/i.test(f));
  const mainPrefix = mainIdx >= 0 ? sorted[mainIdx] : sorted[0];
  const featurePrefix = sorted.find((f) => f !== mainPrefix) ?? sorted[1];
  return { mainPrefix, featurePrefix };
}

function stripPrefix(path: string, prefix: string): string {
  if (path.startsWith(prefix + "/")) return path.slice(prefix.length + 1);
  return path;
}

function estimateTokens(a: string, b: string): number {
  return Math.ceil((a.length + b.length) / CHARS_PER_TOKEN);
}

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "json", "css", "scss", "less", "html", "htm",
  "md", "mdx", "txt", "yaml", "yml", "toml", "xml", "svg", "env",
  "sh", "bash", "zsh", "ps1", "bat", "cmd",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "hpp",
  "vue", "svelte", "astro", "graphql", "gql", "sql",
  "dockerfile", "makefile", "gitignore", "editorconfig", "eslintrc", "prettierrc"
]);

function isTextFile(path: string): boolean {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name.startsWith(".")) {
    const stripped = name.slice(1);
    if (TEXT_EXTENSIONS.has(stripped)) return true;
    // dotfiles like .gitignore, .env etc
    if (!stripped.includes(".")) return true;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext) || !ext;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function BranchMergerLab() {
  const [session, setSession] = useState<MergeSession>({
    diffAnalysis: null,
    mergeResults: [],
    status: "idle",
    progress: 0,
    totalToMerge: 0
  });
  const [dragOver, setDragOver] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [providerHint, setProviderHint] = useState<"openai" | "anthropic" | "server">("server");
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lazy-load JSZip — store the constructor function directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsZipCtorRef = useRef<any>(null);
  const [jsZipReady, setJsZipReady] = useState(false);

  useEffect(() => {
    import("jszip").then((mod) => {
      // Handle both CJS default-export and ESM shapes
      jsZipCtorRef.current = (mod as { default?: unknown }).default ?? mod;
      setJsZipReady(true);
    });
  }, []);

  /* ---------- ZIP Processing (client-side) ---------- */

  const processZip = useCallback(async (file: File) => {
    if (!jsZipCtorRef.current) { setZipError("JSZip library is still loading. Please wait."); return; }
    const JSZip = jsZipCtorRef.current;

    setSession((s) => ({ ...s, status: "analyzing", diffAnalysis: null, mergeResults: [] }));
    setZipError(null);
    setSelectedFile(null);

    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);

      const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
      const branches = detectBranches(allPaths);

      if (!branches) {
        setZipError(
          "A ZIP-nek legalább 2 gyökérmappát kell tartalmaznia (pl. 'main/' és 'feature/'). " +
          "A mappák nevében a 'main' szó jelöli a fő branchet."
        );
        setSession((s) => ({ ...s, status: "error" }));
        return;
      }

      const mainFiles = new Map<string, BranchFile>();
      const featureFiles = new Map<string, BranchFile>();

      for (const path of allPaths) {
        if (!isTextFile(path)) continue;
        const entry = zip.files[path];
        const content = await entry.async("string");
        const bf: BranchFile = { relativePath: path, content, sizeBytes: content.length };

        if (path.startsWith(branches.mainPrefix + "/")) {
          mainFiles.set(stripPrefix(path, branches.mainPrefix), bf);
        } else if (path.startsWith(branches.featurePrefix + "/")) {
          featureFiles.set(stripPrefix(path, branches.featurePrefix), bf);
        }
      }

      // Build diff analysis
      const diffPairs: DiffPair[] = [];
      const mainOnly: UniqueFile[] = [];
      const featureOnly: UniqueFile[] = [];
      let unchangedCount = 0;

      for (const [rel, mf] of mainFiles) {
        const ff = featureFiles.get(rel);
        if (!ff) {
          mainOnly.push({ relativePath: rel, content: mf.content, branch: "main", sizeBytes: mf.sizeBytes });
        } else if (mf.content === ff.content) {
          unchangedCount++;
        } else {
          diffPairs.push({
            relativePath: rel,
            mainContent: mf.content,
            featureContent: ff.content,
            mainSizeBytes: mf.sizeBytes,
            featureSizeBytes: ff.sizeBytes,
            estimatedTokens: estimateTokens(mf.content, ff.content)
          });
        }
      }

      for (const [rel, ff] of featureFiles) {
        if (!mainFiles.has(rel)) {
          featureOnly.push({ relativePath: rel, content: ff.content, branch: "feature", sizeBytes: ff.sizeBytes });
        }
      }

      const analysis: DiffAnalysis = {
        diffPairs,
        mainOnly,
        featureOnly,
        unchangedCount,
        totalFiles: mainFiles.size + featureOnly.length
      };

      setSession((s) => ({
        ...s,
        status: "idle",
        diffAnalysis: analysis,
        mergeResults: diffPairs.map((dp) => ({
          relativePath: dp.relativePath,
          status: dp.estimatedTokens > MAX_TOKENS_PER_FILE ? "skipped_too_large" : "pending",
          tokenEstimate: dp.estimatedTokens
        }))
      }));
    } catch (err) {
      setZipError(err instanceof Error ? err.message : "Ismeretlen hiba a ZIP feldolgozás során.");
      setSession((s) => ({ ...s, status: "error" }));
    }
  }, []);

  /* ---------- AI Merge ---------- */

  const runMerge = useCallback(async () => {
    if (!session.diffAnalysis) return;
    stopRef.current = false;

    const pairs = session.diffAnalysis.diffPairs;
    const results = [...session.mergeResults];
    const mergeable = results.filter((r) => r.status === "pending");

    setSession((s) => ({
      ...s,
      status: "merging",
      progress: 0,
      totalToMerge: mergeable.length
    }));

    let done = 0;

    for (let i = 0; i < results.length; i++) {
      if (stopRef.current) break;
      if (results[i].status !== "pending") continue;

      const pair = pairs.find((p) => p.relativePath === results[i].relativePath);
      if (!pair) continue;

      results[i] = { ...results[i], status: "merging" };
      setSession((s) => ({
        ...s,
        mergeResults: [...results],
        currentFile: pair.relativePath,
        progress: done
      }));

      const started = Date.now();

      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        // If user provided a client-side API key, pass it through a custom header
        if (apiKeyInput && providerHint !== "server") {
          headers["x-ai-api-key"] = apiKeyInput;
          headers["x-ai-provider"] = providerHint;
        }

        const res = await fetch("/api/ai-merge", {
          method: "POST",
          headers,
          body: JSON.stringify({
            relativePath: pair.relativePath,
            mainContent: pair.mainContent,
            featureContent: pair.featureContent
          })
        });

        const json = (await res.json()) as AiMergeResponse;

        if (!res.ok || json.error) {
          results[i] = {
            ...results[i],
            status: "error",
            error: json.error ?? `HTTP ${res.status}`,
            elapsedMs: Date.now() - started
          };
        } else {
          results[i] = {
            ...results[i],
            status: "merged",
            mergedContent: json.mergedContent,
            elapsedMs: Date.now() - started,
            tokenEstimate: json.tokensUsed
          };
        }
      } catch (err) {
        results[i] = {
          ...results[i],
          status: "error",
          error: err instanceof Error ? err.message : "Network error",
          elapsedMs: Date.now() - started
        };
      }

      done++;
      setSession((s) => ({
        ...s,
        mergeResults: [...results],
        progress: done
      }));
    }

    setSession((s) => ({ ...s, status: "complete", currentFile: undefined }));
  }, [session.diffAnalysis, session.mergeResults, apiKeyInput, providerHint]);

  /* ---------- Download merged ZIP ---------- */

  const downloadMergedZip = useCallback(async () => {
    if (!jsZipCtorRef.current || !session.diffAnalysis) return;
    const JSZip = jsZipCtorRef.current;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const zip = new JSZip();
    const analysis = session.diffAnalysis;

    // 1. Add merged files
    for (const mr of session.mergeResults) {
      if (mr.status === "merged" && mr.mergedContent) {
        zip.file(mr.relativePath, mr.mergedContent);
      } else {
        // Fallback to main version if merge failed
        const pair = analysis.diffPairs.find((p) => p.relativePath === mr.relativePath);
        if (pair) zip.file(pair.relativePath, pair.mainContent);
      }
    }

    // 2. Add main-only files (unchanged)
    for (const uf of analysis.mainOnly) {
      zip.file(uf.relativePath, uf.content);
    }

    // 3. Add feature-only files (new additions)
    for (const uf of analysis.featureOnly) {
      zip.file(uf.relativePath, uf.content);
    }

    // 4. We'd also want unchanged files - but we didn't store them.
    //    The user should know only changed/new files are in the output.

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merged-repository.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [session.diffAnalysis, session.mergeResults]);

  /* ---------- Derived state ---------- */

  const analysis = session.diffAnalysis;

  const stats = useMemo(() => {
    if (!analysis) return null;
    const merged = session.mergeResults.filter((r) => r.status === "merged").length;
    const errors = session.mergeResults.filter((r) => r.status === "error").length;
    const skipped = session.mergeResults.filter((r) => r.status === "skipped_too_large").length;
    const pending = session.mergeResults.filter((r) => r.status === "pending").length;
    return { merged, errors, skipped, pending, total: session.mergeResults.length };
  }, [analysis, session.mergeResults]);

  const selectedResult = selectedFile
    ? session.mergeResults.find((r) => r.relativePath === selectedFile)
    : null;

  const selectedPair = selectedFile && analysis
    ? analysis.diffPairs.find((p) => p.relativePath === selectedFile)
    : null;

  /* ---------- Drag and Drop ---------- */

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".zip")) {
      void processZip(file);
    } else {
      setZipError("Kérlek, .zip kiterjesztésű fájlt dobj ide.");
    }
  }, [processZip]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processZip(file);
  }, [processZip]);

  /* ---------- Status badge color ---------- */

  function statusColor(s: MergeFileResult["status"]): string {
    switch (s) {
      case "merged": return "#22c55e";
      case "merging": return "#f59e0b";
      case "error": return "#ef4444";
      case "skipped_too_large": return "#a855f7";
      default: return "#64748b";
    }
  }

  function statusLabel(s: MergeFileResult["status"]): string {
    switch (s) {
      case "merged": return "Összefésülve";
      case "merging": return "Folyamatban…";
      case "error": return "Hiba";
      case "skipped_too_large": return "Túl nagy";
      case "pending": return "Várakozik";
      default: return s;
    }
  }

  /* ---------- Render ---------- */

  return (
    <section style={{ display: "grid", gap: 18 }}>

      {/* ---- Upload zone ---- */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#4f8cff" : "#30406c"}`,
          borderRadius: 16,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "rgba(79,140,255,0.06)" : "rgba(18,26,46,0.6)",
          transition: "all 0.2s"
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.7 }}>📦</div>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>
          ZIP fájl feltöltése
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Húzd ide a fájlt, vagy kattints a tallózáshoz. A ZIP-nek 2 gyökérmappát kell tartalmaznia (pl. <code>main/</code> és <code>feature/</code>).
        </p>
      </div>

      {zipError && (
        <div className="card" style={{ borderColor: "#ef4444", background: "rgba(239,68,68,0.08)" }}>
          <strong>Hiba:</strong> {zipError}
        </div>
      )}

      {/* ---- Loading spinner during analysis ---- */}
      {session.status === "analyzing" && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8, animation: "spin 1s linear infinite" }}>⚙️</div>
          <p>ZIP kicsomagolása és fájlok összehasonlítása…</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ---- Analysis results ---- */}
      {analysis && (
        <>
          <div className="card">
            <h3 style={{ margin: "0 0 12px" }}>Diff összefoglaló</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div style={{ background: "#1a2440", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>{analysis.diffPairs.length}</div>
                <div className="muted" style={{ fontSize: 12 }}>Módosított fájl</div>
              </div>
              <div style={{ background: "#1a2440", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{analysis.unchangedCount}</div>
                <div className="muted" style={{ fontSize: 12 }}>Változatlan</div>
              </div>
              <div style={{ background: "#1a2440", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>{analysis.featureOnly.length}</div>
                <div className="muted" style={{ fontSize: 12 }}>Csak feature-ben</div>
              </div>
              <div style={{ background: "#1a2440", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#94a3b8" }}>{analysis.mainOnly.length}</div>
                <div className="muted" style={{ fontSize: 12 }}>Csak main-ben</div>
              </div>
            </div>
          </div>

          {/* ---- AI Config ---- */}
          <div className="card">
            <h3 style={{ margin: "0 0 10px" }}>AI Merge beállítások</h3>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
              Az AI merge-hez szükség van egy LLM API kulcsra. Beállíthatod a Vercel env-ben
              (<code>OPENAI_API_KEY</code> vagy <code>ANTHROPIC_API_KEY</code>), vagy add meg itt a böngészőben.
            </p>
            <div className="row two">
              <label>
                Provider
                <select value={providerHint} onChange={(e) => setProviderHint(e.target.value as typeof providerHint)}>
                  <option value="server">Server env (default)</option>
                  <option value="openai">OpenAI (kliens kulcs)</option>
                  <option value="anthropic">Anthropic (kliens kulcs)</option>
                </select>
              </label>
              {providerHint !== "server" && (
                <label>
                  API Key
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={providerHint === "openai" ? "sk-..." : "sk-ant-..."}
                  />
                </label>
              )}
            </div>
          </div>

          {/* ---- Merge controls ---- */}
          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => void runMerge()}
                disabled={session.status === "merging" || !analysis.diffPairs.length}
                style={{ flex: "1 1 200px" }}
              >
                {session.status === "merging"
                  ? `Merge folyamatban… (${session.progress}/${session.totalToMerge})`
                  : `AI Merge indítása (${analysis.diffPairs.filter((p) => p.estimatedTokens <= MAX_TOKENS_PER_FILE).length} fájl)`
                }
              </button>
              {session.status === "merging" && (
                <button
                  className="secondary"
                  onClick={() => { stopRef.current = true; }}
                  style={{ flex: "0 0 120px" }}
                >
                  Leállítás
                </button>
              )}
              {session.status === "complete" && (
                <button
                  onClick={() => void downloadMergedZip()}
                  style={{ flex: "1 1 200px", background: "#22c55e" }}
                >
                  📥 Merged ZIP letöltése
                </button>
              )}
            </div>

            {/* Progress bar */}
            {session.status === "merging" && session.totalToMerge > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ background: "#1a2440", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div
                    style={{
                      background: "linear-gradient(90deg, #4f8cff, #22c55e)",
                      height: "100%",
                      width: `${(session.progress / session.totalToMerge) * 100}%`,
                      transition: "width 0.3s ease"
                    }}
                  />
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Aktuális fájl: <code>{session.currentFile ?? "—"}</code>
                </p>
              </div>
            )}

            {/* Stats */}
            {stats && stats.total > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                <span className="chip" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>
                  ✓ {stats.merged} összefésülve
                </span>
                {stats.errors > 0 && (
                  <span className="chip" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>
                    ✗ {stats.errors} hiba
                  </span>
                )}
                {stats.skipped > 0 && (
                  <span className="chip" style={{ background: "rgba(168,85,247,0.2)", color: "#a855f7" }}>
                    ⊘ {stats.skipped} kihagyva (túl nagy)
                  </span>
                )}
                {stats.pending > 0 && (
                  <span className="chip">
                    ◌ {stats.pending} várakozik
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ---- File list ---- */}
          <div className="card">
            <h3 style={{ margin: "0 0 12px" }}>Módosított fájlok</h3>
            {analysis.diffPairs.length === 0 ? (
              <p className="muted">Nincs eltérő fájl a két branch között.</p>
            ) : (
              <div style={{ maxHeight: 360, overflow: "auto" }}>
                {analysis.diffPairs.map((dp) => {
                  const mr = session.mergeResults.find((r) => r.relativePath === dp.relativePath);
                  const isSelected = selectedFile === dp.relativePath;
                  return (
                    <div
                      key={dp.relativePath}
                      onClick={() => setSelectedFile(isSelected ? null : dp.relativePath)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: isSelected ? "rgba(79,140,255,0.1)" : "transparent",
                        borderBottom: "1px solid #1a2440"
                      }}
                    >
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: statusColor(mr?.status ?? "pending"),
                          flexShrink: 0
                        }}
                      />
                      <span style={{ flex: 1, fontSize: 13, fontFamily: "monospace" }}>
                        {dp.relativePath}
                      </span>
                      <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>
                        ~{dp.estimatedTokens.toLocaleString()} tok
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: statusColor(mr?.status ?? "pending") + "22",
                          color: statusColor(mr?.status ?? "pending"),
                          flexShrink: 0
                        }}
                      >
                        {statusLabel(mr?.status ?? "pending")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- Feature-only files ---- */}
          {analysis.featureOnly.length > 0 && (
            <div className="card">
              <h3 style={{ margin: "0 0 8px" }}>Csak a feature branchben létező fájlok</h3>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                Ezek automatikusan bekerülnek az összefésült ZIP-be.
              </p>
              {analysis.featureOnly.map((uf) => (
                <div key={uf.relativePath} style={{ fontSize: 13, fontFamily: "monospace", padding: "3px 0" }}>
                  <span style={{ color: "#3b82f6" }}>+</span> {uf.relativePath}
                  <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>({humanSize(uf.sizeBytes)})</span>
                </div>
              ))}
            </div>
          )}

          {/* ---- Selected file detail ---- */}
          {selectedFile && selectedPair && (
            <div className="card" style={{ borderColor: "#4f8cff" }}>
              <h3 style={{ margin: "0 0 8px", fontFamily: "monospace", fontSize: 14 }}>{selectedFile}</h3>
              <div className="chips" style={{ marginBottom: 10 }}>
                <span className="chip">main: {humanSize(selectedPair.mainSizeBytes)}</span>
                <span className="chip">feature: {humanSize(selectedPair.featureSizeBytes)}</span>
                <span className="chip">~{selectedPair.estimatedTokens.toLocaleString()} tokens</span>
                {selectedResult?.elapsedMs && <span className="chip">{selectedResult.elapsedMs}ms</span>}
              </div>

              {selectedResult?.error && (
                <div style={{ background: "rgba(239,68,68,0.1)", padding: 8, borderRadius: 8, marginBottom: 10, fontSize: 13, color: "#ef4444" }}>
                  {selectedResult.error}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: selectedResult?.mergedContent ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Main branch</div>
                  <div className="pre" style={{ fontSize: 11, maxHeight: 300 }}>{selectedPair.mainContent}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Feature branch</div>
                  <div className="pre" style={{ fontSize: 11, maxHeight: 300 }}>{selectedPair.featureContent}</div>
                </div>
                {selectedResult?.mergedContent && (
                  <div>
                    <div style={{ fontSize: 11, marginBottom: 4, color: "#22c55e" }}>Összefésült</div>
                    <div className="pre" style={{ fontSize: 11, maxHeight: 300, borderColor: "#22c55e33" }}>
                      {selectedResult.mergedContent}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- How it works ---- */}
      {!analysis && session.status === "idle" && (
        <div className="card">
          <h3 style={{ margin: "0 0 8px" }}>Hogyan működik?</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <strong>1.</strong> Készíts egy ZIP fájlt két mappával: <code>main/</code> (a stabil kódbázis) és <code>feature/</code> (az új funkciókkal bővített branch).<br />
            <strong>2.</strong> Töltsd fel a ZIP-et ide — a rendszer kliens oldalon kicsomagolja és összehasonlítja a fájlokat.<br />
            <strong>3.</strong> Kizárólag a módosított fájlokat küldi el az AI-nak merge-re, a változatlanokkal nem foglalkozik.<br />
            <strong>4.</strong> Az AI összefésüli a fájlokat úgy, hogy a main branch logikája megmaradjon és a feature branch újdonságai is bekerüljenek.<br />
            <strong>5.</strong> Letöltheted az összefésült kódot egyetlen ZIP-ben.<br /><br />
            <strong>Token limit:</strong> Fájlpáronként max ~{MAX_TOKENS_PER_FILE.toLocaleString()} token ({(MAX_TOKENS_PER_FILE * CHARS_PER_TOKEN / 1024).toFixed(0)} KB). Túl nagy fájlok kihagyásra kerülnek.
          </div>
        </div>
      )}
    </section>
  );
}
