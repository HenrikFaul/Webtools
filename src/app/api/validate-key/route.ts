import { NextResponse } from "next/server";
import { runValidation } from "@/features/api-key-lab/server/diagnose";
import type { ValidateRequest } from "@/types/diagnostics";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ValidateRequest;
    if (!payload?.method || !payload?.headerName || !payload?.headerValue) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const result = await runValidation(payload);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
}
