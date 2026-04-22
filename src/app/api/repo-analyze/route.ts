import { NextResponse } from "next/server";
import { analyzeRepoText } from "@/features/traffic-import-lab/server/analyzeRepo";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { rawInput?: string };
    const entries = analyzeRepoText(payload.rawInput ?? "");
    return NextResponse.json({ count: entries.length, entries }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
