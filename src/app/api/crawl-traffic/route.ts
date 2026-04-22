import { NextResponse } from "next/server";
import { crawlTraffic } from "@/features/traffic-import-lab/server/crawlTraffic";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { url?: string };
    if (!payload.url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    const result = await crawlTraffic(payload.url);
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
