import { BranchMergerLab } from "@/features/branch-merger/components/BranchMergerLab";

export default function BranchMergerPage() {
  return (
    <main className="shell">
      <h1>AI Semantic Branch Merger</h1>
      <p className="muted">
        Intelligens kód-összefésülő: feltöltött ZIP alapján azonosítja a main és feature branch közti
        különbségeket, majd LLM segítségével regressziómentesen összefésüli a fájlokat.
      </p>
      <BranchMergerLab />
    </main>
  );
}
