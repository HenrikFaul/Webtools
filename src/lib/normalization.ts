export function normalizeSupabaseTarget(baseUrl: string, functionPath: string): { normalizedTarget: string; hints: string[] } {
  const hints: string[] = [];
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  const cleanPath = functionPath.trim();

  if (cleanPath.includes("/functions/v1") && cleanBase.includes("/functions/v1")) {
    hints.push("Detected duplicate /functions/v1 in base URL and function path.");
  }

  if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    hints.push("Full URL pasted in function field; using full URL as-is.");
    return { normalizedTarget: cleanPath, hints };
  }

  const pathNoPrefix = cleanPath.replace(/^\/functions\/v1\/?/, "").replace(/^\//, "");
  const normalizedTarget = `${cleanBase}/functions/v1/${pathNoPrefix}`;
  return { normalizedTarget, hints };
}
