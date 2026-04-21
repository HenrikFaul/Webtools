import Link from "next/link";
import { TOOL_REGISTRY } from "@/features/tool-registry";

export default function HomePage() {
  return (
    <main className="shell">
      <h1>VibeCoding toolset</h1>
      <p className="muted">Unauthenticated internal debugging workbench. Evidence-first, modular, and future-extensible.</p>
      <section className="grid">
        {TOOL_REGISTRY.map((tool) => (
          <Link key={tool.slug} href={tool.href} className="card">
            <div className="chips"><span className="chip">{tool.status}</span></div>
            <h3>{tool.title}</h3>
            <p className="muted">{tool.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
