import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

interface HeartbeatPayload {
  progress_processed?: number;
  progress_total?: number;
  status?: "running" | "completed" | "failed";
  error_message?: string;
  notes?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

    if (!runId) {
      return NextResponse.json({ error: "run_id szükséges" }, { status: 400 });
    }

    let body: HeartbeatPayload = {};
    try {
      body = (await req.json()) as HeartbeatPayload;
    } catch {
      // empty body is fine – treated as a simple alive ping
    }

    const db = getSupabaseAdmin();

    // First verify the run exists and is not already terminated
    const { data: run, error: fetchErr } = await db
      .from("news_scan_runs")
      .select("run_id, status")
      .eq("run_id", runId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: "Futás nem található" }, { status: 404 });

    // If already cancelled/failed, tell the caller to stop
    if (["cancelled", "failed", "completed"].includes(run.status)) {
      return NextResponse.json(
        { run_id: runId, status: run.status, should_stop: true },
        { status: 200 }
      );
    }

    const updates: Record<string, unknown> = {
      last_heartbeat_at: new Date().toISOString(),
      // Promote queued → running on first heartbeat
      status: body.status ?? (run.status === "queued" ? "running" : run.status),
    };

    if (typeof body.progress_processed === "number") {
      updates.progress_processed = body.progress_processed;
    }
    if (typeof body.progress_total === "number") {
      updates.progress_total = body.progress_total;
    }
    if (body.status === "completed" || body.status === "failed") {
      updates.finished_at = new Date().toISOString();
    }
    if (body.error_message) updates.error_message = body.error_message;
    if (body.notes) updates.notes = body.notes;

    const { data: updated, error: updateErr } = await db
      .from("news_scan_runs")
      .update(updates)
      .eq("run_id", runId)
      .select("run_id, status, progress_processed, progress_total")
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({
      run_id: updated.run_id,
      status: updated.status,
      progress_processed: updated.progress_processed,
      progress_total: updated.progress_total,
      should_stop: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
