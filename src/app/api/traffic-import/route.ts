import { NextResponse } from "next/server";
import { importTraffic } from "@/features/traffic-import-lab/server/importTraffic";
import type { TrafficImportRequest } from "@/types/trafficImport";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as TrafficImportRequest;
    if (!payload?.mode) {
      return NextResponse.json({ error: "mode is required" }, { status: 400 });
    }
    const data = importTraffic(payload);
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
