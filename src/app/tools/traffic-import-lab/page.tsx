import { TrafficImportLab } from "@/features/traffic-import-lab/components/TrafficImportLab";

export default function TrafficImportLabPage() {
  return (
    <main className="shell">
      <h1>Traffic Import & End-to-End Simulation Lab</h1>
      <p className="muted">
        Import traffic evidence (manual/HAR/OpenAPI/repo-static), normalize into manifest entries,
        then replay and diagnose. Audit-workspace experiments from the branch are preserved through
        the live crawl, source-analysis, import, and replay flows without replacing the main stable UI shell.
      </p>
      <TrafficImportLab />
    </main>
  );
}
