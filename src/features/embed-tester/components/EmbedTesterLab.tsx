"use client";

import { useEffect, useRef, useState } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIframeSnippet(raw: string): {
  src: string;
  width: string;
  height: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Raw URL pasted directly
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { src: trimmed, width: "100%", height: "500" };
  }

  // HTML iframe snippet — extract attrs with a temporary DOM parser
  const match = trimmed.match(/<iframe([^>]*)>/i);
  if (!match) return null;

  const attrs = match[1];
  const src    = (attrs.match(/src=["']([^"']+)["']/i)    ?? [])[1] ?? "";
  const width  = (attrs.match(/width=["']([^"']+)["']/i)  ?? [])[1] ?? "100%";
  const height = (attrs.match(/height=["']([^"']+)["']/i) ?? [])[1] ?? "500";

  return src ? { src, width, height } : null;
}

function detectViewType(src: string): string {
  if (src.includes("capacity_planner")) return "📊 Kapacitástervező";
  if (src.includes("shift_roster"))     return "👥 Műszak-roster";
  return "🔲 Ismeretlen nézet";
}

function extractToken(src: string): string {
  try {
    // HashRouter URLs: https://app.example.com/#/embed/view?token=abc&...
    const hashPart = src.includes("#") ? src.split("#")[1] : src;
    const sp = new URLSearchParams(hashPart.includes("?") ? hashPart.split("?")[1] : "");
    return sp.get("token") ?? "—";
  } catch {
    return "—";
  }
}

function extractOffice(src: string): string {
  try {
    const hashPart = src.includes("#") ? src.split("#")[1] : src;
    const sp = new URLSearchParams(hashPart.includes("?") ? hashPart.split("?")[1] : "");
    return sp.get("office") ?? "összes";
  } catch {
    return "összes";
  }
}

function extractMode(src: string): string {
  try {
    const hashPart = src.includes("#") ? src.split("#")[1] : src;
    const sp = new URLSearchParams(hashPart.includes("?") ? hashPart.split("?")[1] : "");
    return sp.get("mode") ?? "weekly";
  } catch {
    return "weekly";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const PLACEHOLDER = `<iframe
  src="https://your-effectime-app.com/#/embed/capacity_planner?token=YOUR_TOKEN_HERE"
  width="100%"
  height="500"
  style="border:none;border-radius:8px;"
  allowfullscreen
></iframe>`;

export function EmbedTesterLab() {
  const [input,     setInput]     = useState("");
  const [parsed,    setParsed]    = useState<{ src: string; width: string; height: string } | null>(null);
  const [previewH,  setPreviewH]  = useState(500);
  const [previewW,  setPreviewW]  = useState<"100%" | "768px" | "480px" | "375px">("100%");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [copied,    setCopied]    = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Parse on input change
  useEffect(() => {
    const result = parseIframeSnippet(input);
    setParsed(result);
    if (result) {
      const h = parseInt(result.height, 10);
      if (!isNaN(h) && h > 0) setPreviewH(Math.min(Math.max(h, 200), 900));
      setLoadState("loading");
    } else {
      setLoadState("idle");
    }
  }, [input]);

  const handleCopySrc = async () => {
    if (!parsed?.src) return;
    await navigator.clipboard.writeText(parsed.src);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenTab = () => {
    if (parsed?.src) window.open(parsed.src, "_blank");
  };

  const tokenPreview = parsed ? extractToken(parsed.src) : null;
  const tokenDisplay = tokenPreview && tokenPreview !== "—"
    ? tokenPreview.slice(0, 12) + "…"
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Input ── */}
      <section>
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "var(--muted)" }}>
          Illeszd be az iframe kódot vagy az embed URL-t:
        </label>
        <textarea
          rows={6}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={PLACEHOLDER}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="secondary"
            style={{ width: "auto", padding: "8px 18px", fontSize: 13 }}
            onClick={() => { setInput(""); setParsed(null); setLoadState("idle"); }}
          >
            Törlés
          </button>
          {parsed && (
            <>
              <button
                className="secondary"
                style={{ width: "auto", padding: "8px 18px", fontSize: 13 }}
                onClick={handleCopySrc}
              >
                {copied ? "✓ Másolva" : "URL másolása"}
              </button>
              <button
                className="secondary"
                style={{ width: "auto", padding: "8px 18px", fontSize: 13 }}
                onClick={handleOpenTab}
              >
                ↗ Megnyitás új lapon
              </button>
            </>
          )}
        </div>
      </section>

      {/* ── Parsed info ── */}
      {parsed && (
        <section style={{ background: "var(--panel-2)", borderRadius: 10, padding: 14, fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <InfoCell label="Nézet típusa"  value={detectViewType(parsed.src)} />
            <InfoCell label="Token (előnézet)" value={tokenDisplay} mono />
            <InfoCell label="Iroda-szűrő"   value={extractOffice(parsed.src)} />
            <InfoCell label="Mód"            value={extractMode(parsed.src) === "monthly" ? "📅 Havi" : "📋 Heti"} />
            <InfoCell label="iframe szélesség" value={parsed.width} />
            <InfoCell label="iframe magasság"  value={parsed.height + "px"} />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", wordBreak: "break-all" }}>
            <strong>Embed URL:</strong> {parsed.src}
          </div>
        </section>
      )}

      {/* ── Preview controls ── */}
      {parsed && (
        <section style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
              Előnézet szélesség
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["100%", "768px", "480px", "375px"] as const).map(w => (
                <button
                  key={w}
                  onClick={() => setPreviewW(w)}
                  style={{
                    width: "auto", padding: "5px 12px", fontSize: 12,
                    background: previewW === w ? "var(--accent)" : "var(--panel-2)",
                    border: "1px solid #30406c"
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
              Előnézet magasság: {previewH}px
            </label>
            <input
              type="range" min={200} max={900} step={50}
              value={previewH}
              onChange={e => setPreviewH(Number(e.target.value))}
              style={{ padding: 0, height: 20 }}
            />
          </div>
          <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%", display: "inline-block",
              background: loadState === "loaded" ? "#22c55e"
                : loadState === "error" ? "#ef4444"
                : loadState === "loading" ? "#f59e0b"
                : "#555"
            }} />
            <span style={{ color: "var(--muted)" }}>
              {loadState === "loaded" ? "Betöltve" : loadState === "error" ? "Hiba" : loadState === "loading" ? "Betöltés…" : ""}
            </span>
          </div>
        </section>
      )}

      {/* ── Live preview ── */}
      {parsed ? (
        <section style={{ borderRadius: 12, border: "1px solid #233158", overflow: "hidden" }}>
          <div style={{
            background: "var(--panel-2)", padding: "8px 14px", fontSize: 12,
            color: "var(--muted)", display: "flex", alignItems: "center", gap: 8
          }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span style={{ marginLeft: 8 }}>Élő előnézet — {previewW} × {previewH}px</span>
          </div>
          <div style={{ padding: 16, background: "#0b1020", display: "flex", justifyContent: "center" }}>
            <div style={{ width: previewW, maxWidth: "100%" }}>
              <iframe
                ref={iframeRef}
                key={parsed.src}
                src={parsed.src}
                width="100%"
                height={previewH}
                style={{ border: "none", borderRadius: 8, display: "block" }}
                onLoad={() => setLoadState("loaded")}
                onError={() => setLoadState("error")}
                title="Embed előnézet"
              />
            </div>
          </div>
        </section>
      ) : (
        <section style={{
          borderRadius: 12, border: "2px dashed #233158",
          padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 14
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p style={{ margin: 0 }}>
            Illeszd be az Effectime Embed Token Snippet Builder által generált&nbsp;
            <code style={{ background: "var(--panel-2)", padding: "2px 6px", borderRadius: 4 }}>&lt;iframe&gt;</code>
            &nbsp;kódot fentebb, és itt élőben láthatod az eredményt.
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 12 }}>
            Ahol megtalálod: <strong>Effectime → Developer Portal → Beágyazás → Snippet Builder</strong>
          </p>
        </section>
      )}

      {/* ── CRM developer guide ── */}
      <section style={{ background: "var(--panel-2)", borderRadius: 10, padding: 16, fontSize: 13 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>
          🛠 Hogyan illeszd be a CRM-be — lépések a fejlesztőnek
        </h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: "var(--muted)" }}>
          <li>Menj az <strong>Effectime → Developer Portal → Beágyazás</strong> lapra</li>
          <li>Kattints az <strong>Új beágyazási token</strong> gombra, adj nevet (pl. <em>CRM – kapacitásnézet</em>)</li>
          <li>Jelöld be melyik nézeteket engedélyezed (Kapacitástervező / Műszak-roster)</li>
          <li>A <strong>Snippet Builder</strong>-ben válaszd ki az irodát, módot (heti/havi) és magasságot</li>
          <li>Kattints a <strong>Kód másolása</strong> gombra — megkapod az <code>&lt;iframe&gt;</code> HTML kódot</li>
          <li>Ezt a kódot illeszd be a CRM releváns tabjába / oldalába (HTML szerkesztőbe)</li>
          <li>Tesztelés: nyisd meg ezt az Embed Tester eszközt, illeszd be a kódot, és ellenőrizd az élő előnézetet</li>
          <li>Ha a token kompromittálódik: Effectime → Beágyazás → ❌ gomb → Visszavonás → generálj újat</li>
        </ol>
      </section>

    </div>
  );
}

function InfoCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{
        fontFamily: mono ? "ui-monospace, monospace" : undefined,
        fontSize: 13, fontWeight: 600
      }}>{value}</div>
    </div>
  );
}
