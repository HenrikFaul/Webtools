import { runValidation } from "@/features/api-key-lab/server/diagnose";
import type { ManifestReplayRequest, ManifestReplayResponse, RequestManifestEntry } from "@/types/trafficImport";

function renderTemplate(input: string | undefined, context: Record<string, string>): string | undefined {
  if (!input) return input;
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => context[key] ?? `{{${key}}}`);
}

function injectToken(entry: RequestManifestEntry, token: string | undefined): RequestManifestEntry {
  if (!token) return entry;
  return {
    ...entry,
    headersTemplate: {
      ...entry.headersTemplate,
      Authorization: entry.headersTemplate.Authorization ?? `Bearer ${token}`,
      apikey: entry.headersTemplate.apikey ?? token
    }
  };
}

export async function replayManifest(payload: ManifestReplayRequest): Promise<ManifestReplayResponse> {
  const results = [] as ManifestReplayResponse["results"];
  const context: Record<string, string> = {};

  const sorted = payload.chainMode
    ? [...(payload.entries ?? [])].sort((a, b) => (a.dependsOnId ? 1 : 0) - (b.dependsOnId ? 1 : 0))
    : (payload.entries ?? []);

  for (const rawEntry of sorted) {
    const entry = injectToken(rawEntry, payload.tokenInjection);
    const renderedUrl = renderTemplate(entry.resolvedUrl ?? entry.pathTemplate, context);
    const renderedBody = renderTemplate(entry.bodyTemplate, context);

    const validation = await runValidation({
      mode: "generic-header-check",
      method: entry.method || payload.defaultMethod || "GET",
      targetUrl: renderedUrl,
      headerName: payload.headerName,
      headerValue: payload.headerValue,
      extraHeadersJson: JSON.stringify(entry.headersTemplate ?? {}),
      requestBody: renderedBody,
      followRedirects: true
    });

    const firstBody = validation.probes?.[0]?.responseBodyPreview;
    if (firstBody) {
      try {
        const parsed = JSON.parse(firstBody) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string" || typeof v === "number") {
            context[`prev.${k}`] = String(v);
          }
        }
      } catch {
        // non-json preview, ignore
      }
    }

    results.push({
      id: entry.id,
      label: entry.label,
      url: renderedUrl ?? entry.pathTemplate,
      verdict: validation.verdict,
      verdictReason: validation.verdictReason,
      statusCode: validation.probes?.[0]?.status ?? null,
      responsePreview: validation.probes?.[0]?.responseBodyPreview
    });
  }

  return {
    summary: `Replayed ${results.length} manifest entr${results.length === 1 ? "y" : "ies"}${payload.chainMode ? " in chain mode" : ""}.`,
    results
  };
}
