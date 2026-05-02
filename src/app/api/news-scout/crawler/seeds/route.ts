import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canonicalizeUrl, extractDomain } from "@/lib/crawler";

// GET: seed lista lekérése
export async function GET(): Promise<NextResponse> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("crawl_seeds")
      .select("*")
      .order("source_type", { ascending: true })
      .order("label", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ seeds: data ?? [], total: (data ?? []).length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

interface SeedBody {
  url: string;
  source_type?: string;
  label?: string;
  county?: string;
  city?: string;
  postcode?: string;
  is_rss?: boolean;
  crawl_interval_minutes?: number;
  crawl_depth_limit?: number;
  active?: boolean;
}

// POST: új seed hozzáadása
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as SeedBody;
    if (!body.url) return NextResponse.json({ error: "url kötelező" }, { status: 400 });

    const canonical = canonicalizeUrl(body.url);
    if (!canonical) return NextResponse.json({ error: "Érvénytelen URL" }, { status: 400 });

    const domain = extractDomain(canonical);
    const db = getSupabaseAdmin();

    const { data, error } = await db
      .from("crawl_seeds")
      .upsert({
        url: canonical,
        domain,
        source_type: body.source_type ?? "other_public_interest",
        label: body.label ?? null,
        county: body.county ?? null,
        city: body.city ?? null,
        postcode: body.postcode ?? null,
        is_rss: body.is_rss ?? false,
        crawl_interval_minutes: body.crawl_interval_minutes ?? 120,
        crawl_depth_limit: body.crawl_depth_limit ?? 2,
        active: body.active ?? true,
      }, { onConflict: "url" })
      .select("id, url, domain, label, source_type, active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ seed: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

// DELETE: seed deaktiválása (soft delete)
export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id kötelező" }, { status: 400 });

    const db = getSupabaseAdmin();
    const { error } = await db.from("crawl_seeds").update({ active: false }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
