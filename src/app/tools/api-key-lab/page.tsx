import { ApiDiagnosticsLab } from "@/features/api-key-lab/components/ApiDiagnosticsLab";

export default function ApiKeyLabPage() {
  return (
    <main className="shell">
      <h1>API Diagnostics Lab</h1>
      <p className="muted">Probe-based Supabase and generic endpoint diagnostics with safe redaction and sequential batch mode.</p>
      <ApiDiagnosticsLab />
    </main>
  );
}
