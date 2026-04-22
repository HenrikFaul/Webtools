import { runValidation } from "@/features/api-key-lab/server/diagnose";
import type { ManifestReplayRequest, ManifestReplayResponse } from "@/types/trafficImport";

export async function replayManifest(payload: ManifestReplayRequest): Promise<ManifestReplayResponse> {
  const results = [] as ManifestReplayResponse["results"];

  for (const entry of payload.entries ?? []) {
    const validation = await runValidation({
      mode: "generic-header-check",
      method: entry.method || payload.defaultMethod || "GET",
      targetUrl: entry.resolvedUrl,
      headerName: payload.headerName,
      headerValue: payload.headerValue,
      requestBody: entry.bodyTemplate,
      followRedirects: true
    });

    results.push({
      id: entry.id,
      label: entry.label,
      url: entry.resolvedUrl ?? entry.pathTemplate,
      verdict: validation.verdict,
      verdictReason: validation.verdictReason
    });
  }

  return {
    summary: `Replayed ${results.length} manifest entr${results.length === 1 ? "y" : "ies"}.`,
    results
  };
}
