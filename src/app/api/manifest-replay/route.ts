import { NextResponse } from "next/server";
import { replayManifest } from "@/features/traffic-import-lab/server/replayManifest";
import type { ManifestReplayRequest } from "@/types/trafficImport";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ManifestReplayRequest;
    if (!payload.headerName || !payload.headerValue) {
      return NextResponse.json({ error: "headerName and headerValue are required" }, { status: 400 });
    }
    const data = await replayManifest(payload);
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
