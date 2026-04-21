import { isBlockedNetworkTarget } from "@/lib/security";
import type { SupabaseFunctionInventoryItem, SupabaseFunctionInventoryResponse } from "@/types/diagnostics";

interface RawFunction {
  id: string;
  name: string;
  slug: string;
  version?: number;
  status?: string;
  entrypoint_path?: string;
}

async function probeMethod(url: string, method: string, apikey: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        apikey,
        Authorization: `Bearer ${apikey}`,
        "content-type": "application/json"
      },
      body: method === "GET" ? undefined : "{}",
      cache: "no-store"
    });
    return response.status;
  } catch {
    return null;
  }
}

function getProjectRef(baseUrl: string): string {
  const host = new URL(baseUrl).hostname;
  return host.split(".")[0] ?? "";
}

export async function fetchSupabaseFunctionInventory(baseUrl: string, serviceToken: string, runProbes: boolean): Promise<SupabaseFunctionInventoryResponse> {
  if (isBlockedNetworkTarget(baseUrl)) {
    throw new Error("Blocked base URL.");
  }
  const projectRef = getProjectRef(baseUrl);
  if (!projectRef) {
    throw new Error("Could not extract project reference from base URL.");
  }

  const mgmtResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "content-type": "application/json"
    },
    cache: "no-store"
  });

  if (!mgmtResponse.ok) {
    const errText = await mgmtResponse.text();
    throw new Error(`Supabase management API error ${mgmtResponse.status}: ${errText.slice(0, 200)}`);
  }

  const rows = (await mgmtResponse.json()) as RawFunction[];
  const items: SupabaseFunctionInventoryItem[] = [];

  for (const row of rows) {
    const invoke = `${baseUrl.replace(/\/+$/, "")}/functions/v1/${row.slug}`;
    const probeSummary: Record<string, number | null> = {};
    const methodHints: string[] = [];

    if (runProbes) {
      for (const method of ["GET", "POST", "PATCH"]) {
        const status = await probeMethod(invoke, method, serviceToken);
        probeSummary[method] = status;
        if (status !== null && status !== 404 && status !== 405) {
          methodHints.push(method);
        }
      }
    }

    items.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      version: row.version,
      status: row.status,
      entrypointPath: row.entrypoint_path ?? row.slug,
      normalizedInvokeUrl: invoke,
      methodHints: methodHints.length ? methodHints : ["POST"],
      probeSummary,
      requestExample: JSON.stringify({ function: row.slug, payload: { sample: true } }, null, 2),
      responseExample: JSON.stringify({ ok: true, note: "Response example is heuristic; real shape depends on function code." }, null, 2)
    });
  }

  return {
    projectRef,
    count: items.length,
    items,
    warning: "Method hints and request/response examples are heuristic unless function contracts are explicitly provided."
  };
}
