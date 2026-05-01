import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

    if (!runId) {
      return NextResponse.json({ error: "run_id szükséges" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { data: run, error: fetchErr } = await db
      .from("news_scan_runs")
      .select("run_id, status")
      .eq("run_id", runId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: "Futás nem található" }, { status: 404 });

    if (!["queued", "running"].includes(run.status)) {
      return NextResponse.json(
        { error: `Nem lehet leállítani: státusz = ${run.status}` },
        { status: 409 }
      );
    }

    const { data: updated, error: updateErr } = await db
      .from("news_scan_runs")
      .update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
        cancelled_at: new Date().toISOString(),
        error_message: "Manuálisan leállítva a Hírfelderítő Motor felületéről",
      })
      .eq("run_id", runId)
      .select("run_id, status")
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ run_id: updated.run_id, status: updated.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
