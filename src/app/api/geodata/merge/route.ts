import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse } from "@/types/geodata";

const BATCH = 500;

/* helpers */
function firstNonNull(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) if (v != null && v !== "") return v;
  return null;
}

function fillMissing(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === "" || v === false) continue;
    const ev = existing[k];
    if (ev == null || ev === "" || (typeof ev === "object" && JSON.stringify(ev) === "{}") || (typeof ev === "object" && JSON.stringify(ev) === "[]")) {
      updates[k] = v;
    }
  }
  return updates;
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as GeoMergeRequest;
    if (!payload.provider) return NextResponse.json({ error: "provider is required" }, { status: 400 });

    const sb = getSupabaseAdmin();
    const errors: string[] = [];
    let inserted = 0, updated = 0, skipped = 0;
    let from = 0;

    if (payload.provider === "geoapify") {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = sb.from("geoapify_pois").select("*").range(from, from + BATCH - 1);
        if (payload.countryCode) q = q.eq("country_code", payload.countryCode);
        const { data: rows, error } = await q;
        if (error) { errors.push(error.message); break; }
        if (!rows || rows.length === 0) break;

        for (const r of rows) {
          const unified = {
            source_provider: "geoapify" as const,
            source_id: r.external_id,
            name: r.name,
            name_international: r.name_international,
            categories: r.categories,
            country: r.country,
            country_code: r.country_code,
            country_code_iso3: null as string | null,
            iso3166_2: r.iso3166_2,
            state_region: r.state,
            city: r.city,
            district: r.district,
            suburb: r.suburb,
            postal_code: r.postcode,
            street: r.street,
            street_number: r.housenumber,
            formatted_address: r.formatted_address,
            address_line1: r.address_line1,
            address_line2: r.address_line2,
            lat: r.lat,
            lon: r.lon,
            phone: r.phone,
            email: r.email,
            website: r.website,
            facebook: r.facebook,
            instagram: r.instagram,
            tripadvisor: r.tripadvisor,
            opening_hours: r.opening_hours,
            operator: r.operator,
            brand: r.brand,
            branch: r.branch,
            cuisine: r.cuisine,
            diet: r.diet,
            capacity: r.capacity,
            reservation: r.reservation,
            wheelchair: r.wheelchair,
            outdoor_seating: r.outdoor_seating,
            indoor_seating: r.indoor_seating,
            internet_access: r.internet_access,
            air_conditioning: r.air_conditioning,
            smoking: r.smoking,
            toilets: r.toilets,
            takeaway: r.takeaway,
            delivery: r.delivery,
            payment_options: r.payment_options,
            classification_code: null as string | null,
            osm_id: r.osm_id,
            building_type: r.building_type,
            raw_data: r.raw_data,
            source_fetched_at: r.fetched_at,
          };

          const { data: ex } = await sb
            .from("unified_pois")
            .select("*")
            .eq("source_provider", "geoapify")
            .eq("source_id", r.external_id)
            .maybeSingle();

          if (ex) {
            const upd = fillMissing(ex as Record<string, unknown>, unified as unknown as Record<string, unknown>);
            if (Object.keys(upd).length > 0) {
              const { error: e } = await sb.from("unified_pois").update(upd).eq("id", ex.id);
              if (e) errors.push(`upd ${r.external_id}: ${e.message}`);
              else updated++;
            } else skipped++;
          } else {
            const { error: e } = await sb.from("unified_pois").insert(unified);
            if (e) { if (e.code === "23505") skipped++; else errors.push(`ins ${r.external_id}: ${e.message}`); }
            else inserted++;
          }
        }

        from += BATCH;
        if (rows.length < BATCH) break;
      }
    } else if (payload.provider === "tomtom") {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = sb.from("tomtom_pois").select("*").range(from, from + BATCH - 1);
        if (payload.countryCode) q = q.eq("country_code", payload.countryCode);
        const { data: rows, error } = await q;
        if (error) { errors.push(error.message); break; }
        if (!rows || rows.length === 0) break;

        for (const r of rows) {
          const unified = {
            source_provider: "tomtom" as const,
            source_id: r.external_id,
            name: r.name,
            name_international: {},
            categories: r.categories,
            country: r.country,
            country_code: r.country_code,
            country_code_iso3: r.country_code_iso3,
            iso3166_2: null as string | null,
            state_region: firstNonNull(r.country_subdivision_name, r.country_subdivision),
            city: firstNonNull(r.municipality),
            district: r.municipality_subdivision,
            suburb: r.municipality_secondary_subdivision,
            postal_code: r.postal_code,
            street: r.street_name,
            street_number: r.street_number,
            formatted_address: r.freeform_address,
            address_line1: r.name,
            address_line2: r.freeform_address,
            lat: r.lat,
            lon: r.lon,
            phone: r.phone,
            email: null as string | null,
            website: r.url,
            facebook: null as string | null,
            instagram: null as string | null,
            tripadvisor: null as string | null,
            opening_hours: r.opening_hours ? JSON.stringify(r.opening_hours) : null,
            operator: null as string | null,
            brand: null as string | null,
            branch: null as string | null,
            cuisine: null as string | null,
            diet: {},
            capacity: null as number | null,
            reservation: null as string | null,
            wheelchair: null as string | null,
            outdoor_seating: null as boolean | null,
            indoor_seating: null as boolean | null,
            internet_access: null as boolean | null,
            air_conditioning: null as boolean | null,
            smoking: null as string | null,
            toilets: null as string | null,
            takeaway: null as boolean | null,
            delivery: null as boolean | null,
            payment_options: {},
            classification_code: (r.classifications as { code?: string }[])?.[0]?.code ?? null,
            osm_id: null as number | null,
            building_type: null as string | null,
            raw_data: r.raw_data,
            source_fetched_at: r.fetched_at,
          };

          const { data: ex } = await sb
            .from("unified_pois")
            .select("*")
            .eq("source_provider", "tomtom")
            .eq("source_id", r.external_id)
            .maybeSingle();

          if (ex) {
            const upd = fillMissing(ex as Record<string, unknown>, unified as unknown as Record<string, unknown>);
            if (Object.keys(upd).length > 0) {
              const { error: e } = await sb.from("unified_pois").update(upd).eq("id", ex.id);
              if (e) errors.push(`upd ${r.external_id}: ${e.message}`);
              else updated++;
            } else skipped++;
          } else {
            const { error: e } = await sb.from("unified_pois").insert(unified);
            if (e) { if (e.code === "23505") skipped++; else errors.push(`ins ${r.external_id}: ${e.message}`); }
            else inserted++;
          }
        }

        from += BATCH;
        if (rows.length < BATCH) break;
      }
    }

    return NextResponse.json({ inserted, updated, skipped, errors } satisfies GeoMergeResponse);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Merge failed" }, { status: 500 });
  }
}
