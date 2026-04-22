import { NextResponse } from "next/server";
import { fetchSupabaseFunctionInventory } from "@/features/api-key-lab/server/supabaseInventory";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { baseUrl?: string; serviceToken?: string; runProbes?: boolean };
    if (!payload.baseUrl || !payload.serviceToken) {
      return NextResponse.json({ error: "baseUrl and serviceToken are required." }, { status: 400 });
    }

    const data = await fetchSupabaseFunctionInventory(payload.baseUrl, payload.serviceToken, Boolean(payload.runProbes));
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
