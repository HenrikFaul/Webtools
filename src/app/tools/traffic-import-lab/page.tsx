import { TrafficImportLab } from "@/features/traffic-import-lab/components/TrafficImportLab";

export default function TrafficImportLabPage() {
  return (
    <main className="shell">
      <h1>Traffic Import &amp; End-to-End Simulation Lab</h1>
      <p className="muted">
        Import traffic evidence (manual/HAR/OpenAPI/repo-static), normalize into manifest entries,
        then replay and diagnose. The Audit Workspace flow remains available for live/source/import/demo guidance
        without discarding the stable main-branch integration path.
      </p>
      <TrafficImportLab />
    </main>
  );
}
