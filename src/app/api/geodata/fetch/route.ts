import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SUPPORTED_COUNTRIES } from "@/types/geodata";
import type { GeoFetchRequest, GeoFetchResponse } from "@/types/geodata";

const GEOAPIFY_LIMIT = 500; // max per request on free tier
const TOMTOM_LIMIT = 100;   // max per request

/* ------------------------------------------------------------------ */
/*  Geoapify fetch                                                    */
/* ------------------------------------------------------------------ */

interface GeoapifyFeature {
  properties: {
    place_id?: string;
    name?: string;
    categories?: string[];
    country_code?: string;
    country?: string;
    state?: string;
    city?: string;
    postcode?: string;
    street?: string;
    housenumber?: string;
    formatted?: string;
    lat?: number;
    lon?: number;
    opening_hours?: string;
    website?: string;
    contact?: { phone?: string };
    datasource?: unknown;
    [key: string]: unknown;
  };
}

async function fetchGeoapify(
  countryCode: string,
  category: string
): Promise<GeoFetchResponse> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) throw new Error("GEOAPIFY_API_KEY env var is not set.");

  const country = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode);
  if (!country) throw new Error(`Unsupported country: ${countryCode}`);

  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const [lon1, lat1, lon2, lat2] = country.bbox;
    const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(category)}&filter=rect:${lon1},${lat1},${lon2},${lat2}&limit=${GEOAPIFY_LIMIT}&offset=${offset}&apiKey=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text();
      errors.push(`Geoapify API ${res.status}: ${txt.slice(0, 200)}`);
      break;
    }

    const data = (await res.json()) as { features?: GeoapifyFeature[] };
    const features = data.features ?? [];

    if (features.length === 0) {
      hasMore = false;
      break;
    }

    const rows = features
      .filter((f) => f.properties.place_id && f.properties.lat != null && f.properties.lon != null)
      .map((f) => ({
        external_id: f.properties.place_id!,
        name: f.properties.name ?? null,
        categories: f.properties.categories ?? [],
        country_code: countryCode.toUpperCase(),
        country: f.properties.country ?? null,
        state: f.properties.state ?? null,
        city: f.properties.city ?? null,
        postcode: f.properties.postcode ?? null,
        street: f.properties.street ?? null,
        housenumber: f.properties.housenumber ?? null,
        formatted_address: f.properties.formatted ?? null,
        lat: f.properties.lat!,
        lon: f.properties.lon!,
        opening_hours: f.properties.opening_hours ?? null,
        website: f.properties.website ?? null,
        phone: f.properties.contact?.phone ?? null,
        raw_data: f.properties,
        fetch_category: category,
      }));

    if (rows.length > 0) {
      const { error, count } = await sb
        .from("geoapify_pois")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true, count: "exact" });

      if (error) {
        errors.push(`DB insert error: ${error.message}`);
      } else {
        inserted += count ?? rows.length;
      }
      skipped += rows.length - (count ?? rows.length);
    }

    // Geoapify free tier: paginate until we get fewer than limit
    if (features.length < GEOAPIFY_LIMIT) {
      hasMore = false;
    } else {
      offset += GEOAPIFY_LIMIT;
      // Rate limit: wait 200ms between requests (free tier)
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return { provider: "geoapify", countryCode, category, inserted, skipped, errors };
}

/* ------------------------------------------------------------------ */
/*  TomTom fetch                                                      */
/* ------------------------------------------------------------------ */

interface TomTomResult {
  id?: string;
  poi?: {
    name?: string;
    phone?: string;
    url?: string;
    categories?: string[];
    classifications?: Array<{ code?: string; names?: Array<{ name?: string }> }>;
    categorySet?: Array<{ id?: number }>;
  };
  address?: {
    country?: string;
    countryCode?: string;
    municipality?: string;
    municipalitySubdivision?: string;
    postalCode?: string;
    streetName?: string;
    streetNumber?: string;
    freeformAddress?: string;
  };
  position?: { lat?: number; lon?: number };
}

async function fetchTomTom(
  countryCode: string,
  category: string
): Promise<GeoFetchResponse> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) throw new Error("TOMTOM_API_KEY env var is not set.");

  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(category)}.json?key=${apiKey}&countrySet=${countryCode}&limit=${TOMTOM_LIMIT}&ofs=${offset}&language=hu-HU`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text();
      errors.push(`TomTom API ${res.status}: ${txt.slice(0, 200)}`);
      break;
    }

    const data = (await res.json()) as {
      results?: TomTomResult[];
      summary?: { totalResults?: number };
    };
    const results = data.results ?? [];
    const totalResults = data.summary?.totalResults ?? 0;

    if (results.length === 0) {
      hasMore = false;
      break;
    }

    const rows = results
      .filter((r) => r.id && r.position?.lat != null && r.position?.lon != null)
      .map((r) => ({
        external_id: r.id!,
        name: r.poi?.name ?? null,
        categories: r.poi?.categories ?? [],
        category_set: r.poi?.categorySet ?? [],
        country_code: countryCode.toUpperCase(),
        country: r.address?.country ?? null,
        municipality: r.address?.municipality ?? null,
        municipality_subdivision: r.address?.municipalitySubdivision ?? null,
        postal_code: r.address?.postalCode ?? null,
        street_name: r.address?.streetName ?? null,
        street_number: r.address?.streetNumber ?? null,
        formatted_address: r.address?.freeformAddress ?? null,
        lat: r.position!.lat!,
        lon: r.position!.lon!,
        phone: r.poi?.phone ?? null,
        url: r.poi?.url ?? null,
        classification_code: r.poi?.classifications?.[0]?.code ?? null,
        raw_data: r,
        fetch_category: category,
      }));

    if (rows.length > 0) {
      const { error, count } = await sb
        .from("tomtom_pois")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true, count: "exact" });

      if (error) {
        errors.push(`DB insert error: ${error.message}`);
      } else {
        inserted += count ?? rows.length;
      }
      skipped += rows.length - (count ?? rows.length);
    }

    offset += TOMTOM_LIMIT;
    if (offset >= totalResults || results.length < TOMTOM_LIMIT) {
      hasMore = false;
    } else {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { provider: "tomtom", countryCode, category, inserted, skipped, errors };
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                     */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as GeoFetchRequest;

    if (!payload.provider || !payload.countryCode || !payload.category) {
      return NextResponse.json(
        { error: "provider, countryCode, and category are required." },
        { status: 400 }
      );
    }

    let result: GeoFetchResponse;
    if (payload.provider === "geoapify") {
      result = await fetchGeoapify(payload.countryCode, payload.category);
    } else if (payload.provider === "tomtom") {
      result = await fetchTomTom(payload.countryCode, payload.category);
    } else {
      return NextResponse.json(
        { error: `Unknown provider: ${payload.provider}` },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
