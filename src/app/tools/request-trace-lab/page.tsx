import { RequestTraceLab } from "@/features/request-trace-lab/components/RequestTraceLab";

export default function RequestTraceLabPage() {
  return (
    <main className="shell">
      <h1>Request Trace Lab</h1>
      <p className="muted">Inspect redirect chains, response snapshots, and redacted request evidence hop-by-hop.</p>
      <RequestTraceLab />
    </main>
  );
}
