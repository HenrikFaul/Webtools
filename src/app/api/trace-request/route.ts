import { NextResponse } from "next/server";
import { runTraceRequest } from "@/features/request-trace-lab/server/traceRequest";
import type { TraceRequestPayload } from "@/types/requestTrace";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as TraceRequestPayload;
    if (!payload.url || !payload.method) {
      return NextResponse.json({ error: "url and method are required" }, { status: 400 });
    }
    const data = await runTraceRequest(payload);
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
