export interface ToolRegistryItem {
  slug: string;
  title: string;
  description: string;
  href: string;
  status: "ready" | "planned";
}

export const TOOL_REGISTRY: ToolRegistryItem[] = [
  {
    slug: "api-key-lab",
    title: "API Diagnostics Lab",
    description: "Probe-driven key, endpoint, method, and payload diagnostics with trace evidence.",
    href: "/tools/api-key-lab",
    status: "ready"
  },
  {
    slug: "request-trace-lab",
    title: "Request Trace Lab",
    description: "Hop-by-hop request tracing with redirect transparency and redacted evidence cards.",
    href: "/tools/request-trace-lab",
    status: "ready"
  },
  {
    slug: "traffic-import-lab",
    title: "Traffic Import Lab",
    description: "Hybrid traffic import, manifest normalization, replay, and diagnosis workspace.",
    href: "/tools/traffic-import-lab",
    status: "ready"
  }
];
