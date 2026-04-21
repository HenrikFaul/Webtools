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
    description: "Future module for deep hop-by-hop replay, diffing, and proxy-assisted debugging.",
    href: "#",
    status: "planned"
  }
];
