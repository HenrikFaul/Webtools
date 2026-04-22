import { AuditWorkspace } from "@/features/traffic-import-lab/components/AuditWorkspace";

export default function TrafficImportLabPage() {
  return (
    <main className="shell">
      <h1>Audit Workspace</h1>
      <p className="muted">Interactive, self-documenting diagnostics center for live traffic auditing, source reverse-engineering, and deep replay simulation.</p>
      <AuditWorkspace />
    </main>
  );
}
