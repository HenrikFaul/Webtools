import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SUPPORTED_COUNTRIES } from "@/types/geodata";
import type { GeoFetchRequest, GeoFetchResponse } from "@/types/geodata";

/* ------------------------------------------------------------------ */
/*  Geoapify – paginate until all results fetched (NO limit)          */
/* ------------------------------------------------------------------ */

const GEO_PAGE = 500; // per-request page size (API max), NOT a total cap

interface GeoapifyProps {
  name?: string;
  country?: string;
  country_code?: string;
  state?: string;
  city?: string;
  postcode?: string;
  district?: string;
  suburb?: string;
  street?: string;
  housenumber?: string;
  iso3166_2?: string;
  lat?: number;
  lon?: number;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  categories?: string[];
  details?: string[];
  website?: string;
  opening_hours?: string;
  contact?: { phone?: string; email?: string };
  facebook?: string;
  instagram?: string;
  tripadvisor?: string;
  operator?: string;
  brand?: string;
  branch?: string;
  catering?: { cuisine?: string; diet?: Record<string, boolean>; capacity?: number; reservation?: string };
  facilities?: Record<string, boolean | string | Record<string, unknown>>;
  payment_options?: Record<string, boolean>;
  name_international?: Record<string, string>;
  name_other?: Record<string, string>;
  datasource?: { sourcename?: string; raw?: { osm_id?: number; osm_type?: string; [k: string]: unknown } };
  building?: { type?: string };
  place_id?: string;
  distance?: number;
  [k: string]: unknown;
}

async function fetchGeoapify(countryCode: string, category: string): Promise<GeoFetchResponse> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) throw new Error("GEOAPIFY_API_KEY not set.");

  const country = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode);
  if (!country) throw new Error(`Unsupported country: ${countryCode}`);

  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let totalFetched = 0;
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [lon1, lat1, lon2, lat2] = country.bbox;
    const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(category)}&filter=rect:${lon1},${lat1},${lon2},${lat2}&limit=${GEO_PAGE}&offset=${offset}&apiKey=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      errors.push(`Geoapify ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break;
    }

    const data = (await res.json()) as { features?: { properties: GeoapifyProps }[] };
    const features = data.features ?? [];
    if (features.length === 0) break;

    totalFetched += features.length;

    const rows = features
      .filter((f) => f.properties.place_id && f.properties.lat != null)
      .map((f) => {
        const p = f.properties;
        const raw = p.datasource?.raw;
        return {
          external_id: p.place_id!,
          name: p.name ?? null,
          country: p.country ?? null,
          country_code: countryCode.toUpperCase(),
          state: p.state ?? null,
          city: p.city ?? null,
          postcode: p.postcode ?? null,
          district: p.district ?? null,
          suburb: p.suburb ?? null,
          street: p.street ?? null,
          housenumber: p.housenumber ?? null,
          iso3166_2: p.iso3166_2 ?? null,
          lat: p.lat!,
          lon: p.lon!,
          formatted_address: p.formatted ?? null,
          address_line1: p.address_line1 ?? null,
          address_line2: p.address_line2 ?? null,
          categories: p.categories ?? [],
          details: p.details ?? [],
          website: p.website ?? null,
          opening_hours: p.opening_hours ?? null,
          phone: p.contact?.phone ?? null,
          email: p.contact?.email ?? null,
          facebook: (raw?.["contact:facebook"] as string) ?? null,
          instagram: (raw?.["contact:instagram"] as string) ?? null,
          tripadvisor: p.tripadvisor ? String(p.tripadvisor) : (raw?.["contact:tripadvisor"] ? String(raw["contact:tripadvisor"]) : null),
          operator: p.operator ?? null,
          brand: p.brand ?? null,
          branch: p.branch ?? null,
          cuisine: p.catering?.cuisine ?? null,
          diet: p.catering?.diet ?? {},
          capacity: p.catering?.capacity ?? null,
          reservation: p.catering?.reservation ?? null,
          wheelchair: typeof p.facilities?.wheelchair === "boolean" ? (p.facilities.wheelchair ? "yes" : "no") : (typeof p.facilities?.wheelchair === "string" ? String(p.facilities.wheelchair) : null),
          outdoor_seating: p.facilities?.outdoor_seating === true ? true : (p.facilities?.outdoor_seating === false ? false : null),
          indoor_seating: p.facilities?.indoor_seating === true ? true : null,
          internet_access: p.facilities?.internet_access === true ? true : null,
          air_conditioning: p.facilities?.air_conditioning === true ? true : null,
          smoking: typeof p.facilities?.smoking === "boolean" ? (p.facilities.smoking ? "yes" : "no") : (typeof p.facilities?.smoking === "string" ? String(p.facilities.smoking) : null),
          toilets: typeof p.facilities?.toilets === "boolean" ? (p.facilities.toilets ? "yes" : "no") : null,
          takeaway: p.facilities?.takeaway === true ? true : null,
          delivery: p.facilities?.delivery === true ? true : null,
          payment_options: p.payment_options ?? {},
          name_international: p.name_international ?? {},
          name_other: p.name_other ?? {},
          datasource_name: p.datasource?.sourcename ?? null,
          osm_id: raw?.osm_id ? Number(raw.osm_id) : null,
          osm_type: raw?.osm_type ?? null,
          building_type: p.building?.type ?? null,
          raw_data: p,
          fetch_category: category,
        };
      });

    if (rows.length > 0) {
      const { error, count } = await sb
        .from("geoapify_pois")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true, count: "exact" });
      if (error) errors.push(`DB: ${error.message}`);
      else inserted += count ?? rows.length;
      skipped += rows.length - (count ?? rows.length);
    }

    if (features.length < GEO_PAGE) break; // last page
    offset += GEO_PAGE;
    await new Promise((r) => setTimeout(r, 250)); // rate limit courtesy
  }

  return { provider: "geoapify", countryCode, category, inserted, skipped, total: totalFetched, errors };
}

/* ------------------------------------------------------------------ */
/*  TomTom – paginate until totalResults exhausted (NO limit)         */
/* ------------------------------------------------------------------ */

interface TomTomResult {
  type?: string;
  id?: string;
  score?: number;
  dist?: number;
  info?: string;
  poi?: {
    name?: string;
    phone?: string;
    url?: string;
    categories?: string[];
    categorySet?: { id?: number }[];
    classifications?: { code?: string; names?: { nameLocale?: string; name?: string }[] }[];
    openingHours?: unknown;
  };
  address?: {
    streetNumber?: string;
    streetName?: string;
    municipalitySubdivision?: string;
    municipality?: string;
    municipalitySecondarySubdivision?: string;
    countrySubdivision?: string;
    countrySubdivisionName?: string;
    countrySubdivisionCode?: string;
    postalCode?: string;
    countryCode?: string;
    country?: string;
    countryCodeISO3?: string;
    freeformAddress?: string;
    localName?: string;
  };
  position?: { lat?: number; lon?: number };
  viewport?: { topLeftPoint?: { lat?: number; lon?: number }; btmRightPoint?: { lat?: number; lon?: number } };
  entryPoints?: { type?: string; position?: { lat?: number; lon?: number } }[];
}

const TT_PAGE = 100;

async function fetchTomTom(countryCode: string, category: string): Promise<GeoFetchResponse> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) throw new Error("TOMTOM_API_KEY not set.");

  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let totalFetched = 0;
  let offset = 0;
  let totalResults = Infinity;

  while (offset < totalResults) {
    const url = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(category)}.json?key=${apiKey}&countrySet=${countryCode}&limit=${TT_PAGE}&ofs=${offset}&language=hu-HU`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      errors.push(`TomTom ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break;
    }

    const data = (await res.json()) as { results?: TomTomResult[]; summary?: { totalResults?: number } };
    const results = data.results ?? [];
    totalResults = data.summary?.totalResults ?? 0;

    if (results.length === 0) break;
    totalFetched += results.length;

    const rows = results
      .filter((r) => r.id && r.position?.lat != null)
      .map((r) => ({
        external_id: r.id!,
        name: r.poi?.name ?? null,
        phone: r.poi?.phone ?? null,
        url: r.poi?.url ?? null,
        categories: r.poi?.categories ?? [],
        category_set: r.poi?.categorySet ?? [],
        classifications: r.poi?.classifications ?? [],
        opening_hours: r.poi?.openingHours ?? {},
        score: r.score ?? null,
        dist: r.dist ?? null,
        info: r.info ?? null,
        street_number: r.address?.streetNumber ?? null,
        street_name: r.address?.streetName ?? null,
        municipality_subdivision: r.address?.municipalitySubdivision ?? null,
        municipality: r.address?.municipality ?? null,
        municipality_secondary_subdivision: r.address?.municipalitySecondarySubdivision ?? null,
        country_subdivision: r.address?.countrySubdivision ?? null,
        country_subdivision_name: r.address?.countrySubdivisionName ?? null,
        country_subdivision_code: r.address?.countrySubdivisionCode ?? null,
        postal_code: r.address?.postalCode ?? null,
        country_code: countryCode.toUpperCase(),
        country: r.address?.country ?? null,
        country_code_iso3: r.address?.countryCodeISO3 ?? null,
        freeform_address: r.address?.freeformAddress ?? null,
        local_name: r.address?.localName ?? null,
        lat: r.position!.lat!,
        lon: r.position!.lon!,
        viewport_top_lat: r.viewport?.topLeftPoint?.lat ?? null,
        viewport_top_lon: r.viewport?.topLeftPoint?.lon ?? null,
        viewport_btm_lat: r.viewport?.btmRightPoint?.lat ?? null,
        viewport_btm_lon: r.viewport?.btmRightPoint?.lon ?? null,
        entry_points: r.entryPoints ?? [],
        raw_data: r,
        fetch_category: category,
      }));

    if (rows.length > 0) {
      const { error, count } = await sb
        .from("tomtom_pois")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true, count: "exact" });
      if (error) errors.push(`DB: ${error.message}`);
      else inserted += count ?? rows.length;
      skipped += rows.length - (count ?? rows.length);
    }

    offset += TT_PAGE;
    if (results.length < TT_PAGE) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  return { provider: "tomtom", countryCode, category, inserted, skipped, total: totalFetched, errors };
}

/* ------------------------------------------------------------------ */
/*  AWS Location Service Places API – paginate via NextToken           */
/* ------------------------------------------------------------------ */

interface AwsPlaceAddress {
  Label?: string;
  Country?: { Code2?: string; Code3?: string; Name?: string };
  Region?: { Code?: string; Name?: string };
  SubRegion?: { Code?: string; Name?: string };
  Locality?: string;
  District?: string;
  PostalCode?: string;
  Street?: string;
  AddressNumber?: string;
  Building?: string;
}

interface AwsPlaceCategory {
  Id?: string;
  Name?: string;
  LocalizedName?: string;
}

interface AwsPlaceContact {
  Phones?: { Label?: string; Value?: string }[];
  Websites?: { Label?: string; Value?: string }[];
  Emails?: { Label?: string; Value?: string }[];
}

interface AwsPlaceResultItem {
  PlaceId?: string;
  PlaceType?: string;
  Title?: string;
  Address?: AwsPlaceAddress;
  Position?: [number, number]; // [lon, lat]
  Categories?: AwsPlaceCategory[];
  Contacts?: AwsPlaceContact;
  OpeningHours?: unknown[];
}

interface AwsSearchTextResponse {
  ResultItems?: AwsPlaceResultItem[];
  NextToken?: string;
}

const AWS_PAGE = 20;

async function fetchAwsLocation(countryCode: string, category: string): Promise<GeoFetchResponse> {
  const apiKey = process.env.AWS_LOCATION_API_KEY;
  if (!apiKey) throw new Error("AWS_LOCATION_API_KEY not set.");

  const region = process.env.AWS_LOCATION_REGION ?? "eu-central-1";
  const baseUrl = `https://places.geo.${region}.amazonaws.com/v2/searchText`;

  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let totalFetched = 0;
  let nextToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      QueryText: category,
      Filter: { IncludeCountries: [countryCode.toUpperCase()] },
      MaxResults: AWS_PAGE,
      Language: "hu",
    };
    if (nextToken) body.NextToken = nextToken;

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-amz-api-key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      errors.push(`AWS ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break;
    }

    const data = (await res.json()) as AwsSearchTextResponse;
    const items = data.ResultItems ?? [];
    nextToken = data.NextToken ?? undefined;

    if (items.length === 0) break;
    totalFetched += items.length;

    const rows = items
      .filter((item) => item.PlaceId && item.Position)
      .map((item) => {
        const addr = item.Address ?? {};
        const contacts = item.Contacts ?? {};
        const phone = contacts.Phones?.[0]?.Value ?? null;
        const email = contacts.Emails?.[0]?.Value ?? null;
        const website = contacts.Websites?.[0]?.Value ?? null;
        const [lon, lat] = item.Position!;
        return {
          external_id: item.PlaceId!,
          name: item.Title ?? null,
          country_code: addr.Country?.Code2?.toUpperCase() ?? countryCode.toUpperCase(),
          country: addr.Country?.Name ?? null,
          country_code_iso3: addr.Country?.Code3 ?? null,
          state_region: addr.Region?.Name ?? null,
          city: addr.Locality ?? null,
          district: addr.District ?? null,
          postal_code: addr.PostalCode ?? null,
          street: addr.Street ?? null,
          street_number: addr.AddressNumber ?? null,
          formatted_address: addr.Label ?? null,
          lat,
          lon,
          phone,
          email,
          website,
          categories: item.Categories ?? [],
          place_type: item.PlaceType ?? null,
          opening_hours: item.OpeningHours ?? null,
          raw_data: item,
          fetch_category: category,
        };
      });

    if (rows.length > 0) {
      const { error, count } = await sb
        .from("aws_pois")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true, count: "exact" });
      if (error) errors.push(`DB: ${error.message}`);
      else inserted += count ?? rows.length;
      skipped += rows.length - (count ?? rows.length);
    }

    await new Promise((r) => setTimeout(r, 150));
  } while (nextToken);

  return { provider: "aws", countryCode, category, inserted, skipped, total: totalFetched, errors };
}

/* ------------------------------------------------------------------ */
export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as GeoFetchRequest;
    if (!payload.provider || !payload.countryCode || !payload.category) {
      return NextResponse.json({ error: "provider, countryCode, and category are required." }, { status: 400 });
    }

    const result = payload.provider === "geoapify"
      ? await fetchGeoapify(payload.countryCode, payload.category)
      : payload.provider === "tomtom"
        ? await fetchTomTom(payload.countryCode, payload.category)
        : payload.provider === "aws"
          ? await fetchAwsLocation(payload.countryCode, payload.category)
          : null;

    if (!result) return NextResponse.json({ error: `Unknown provider: ${payload.provider}` }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 500 });
  }
}
