const SECRET_HEADERS = ["authorization", "apikey", "x-api-key", "proxy-authorization", "cookie"];

export function redactHeaderValue(name: string, value: string): string {
  const lowered = name.toLowerCase();
  if (SECRET_HEADERS.includes(lowered)) {
    return value.length <= 6 ? "***" : `${value.slice(0, 3)}***${value.slice(-2)}`;
  }
  return value;
}

export function isBlockedNetworkTarget(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "::1"].includes(host)) return true;
    if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
    if (host.startsWith("172.")) {
      const second = Number(host.split(".")[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function safeBodyPreview(input: string | undefined, limit = 1500): string | undefined {
  if (!input) return undefined;
  return input.length > limit ? `${input.slice(0, limit)}…[truncated]` : input;
}
