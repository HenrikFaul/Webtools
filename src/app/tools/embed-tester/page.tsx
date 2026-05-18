import { EmbedTesterLab } from "@/features/embed-tester/components/EmbedTesterLab";

export default function EmbedTesterPage() {
  return (
    <main className="shell">
      <h1>Embed Tester</h1>
      <p className="muted">
        Illeszd be az Effectime Snippet Builder által generált <code>&lt;iframe&gt;</code> kódot
        (vagy csak az URL-t), és nézd meg élőben hogyan jelenik meg az embed — mielőtt beilleszted a CRM-be.
      </p>
      <EmbedTesterLab />
    </main>
  );
}
