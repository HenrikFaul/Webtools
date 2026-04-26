import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { GeoMergeRequest, GeoMergeResponse } from "@/types/geodata";

const BATCH_SIZE = 500;

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as GeoMergeRequest;
    if (!payload.provider) {
      return NextResponse.json({ error: "provider is required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const errors: string[] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    if (payload.provider === "geoapify") {
      // Read from geoapify_pois
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = sb
          .from("geoapify_pois")
          .select("*")
          .range(from, from + BATCH_SIZE - 1);

        if (payload.countryCode) {
          query = query.eq("country_code", payload.countryCode);
        }

        const { data: rows, error } = await query;
        if (error) { errors.push(error.message); break; }
        if (!rows || rows.length === 0) { hasMore = false; break; }

        for (const row of rows) {
          // Check if already exists in unified
          const { data: existing } = await sb
            .from("unified_pois")
            .select("id, name, phone, website, opening_hours")
            .eq("source_provider", "geoapify")
            .eq("source_id", row.external_id)
            .maybeSingle();

          if (existing) {
            // Update missing fields only
            const updates: Record<string, unknown> = {};
            if (!existing.phone && row.phone) updates.phone = row.phone;
            if (!existing.website && row.website) updates.website = row.website;
            if (!existing.opening_hours && row.opening_hours) updates.opening_hours = row.opening_hours;
            if (!existing.name && row.name) updates.name = row.name;

            if (Object.keys(updates).length > 0) {
              const { error: upErr } = await sb
                .from("unified_pois")
                .update(updates)
                .eq("id", existing.id);
              if (upErr) errors.push(`Update ${row.external_id}: ${upErr.message}`);
              else updated++;
            } else {
              skipped++;
            }
          } else {
            // Insert new
            const { error: insErr } = await sb.from("unified_pois").insert({
              source_provider: "geoapify",
              source_id: row.external_id,
              name: row.name,
              categories: row.categories,
              country_code: row.country_code,
              country: row.country,
              region: row.state,
              city: row.city,
              postal_code: row.postcode,
              street: row.street,
              street_number: row.housenumber,
              formatted_address: row.formatted_address,
              lat: row.lat,
              lon: row.lon,
              phone: row.phone,
              website: row.website,
              opening_hours: row.opening_hours,
              raw_data: row.raw_data,
              source_fetched_at: row.fetched_at,
            });

            if (insErr) {
              if (insErr.code === "23505") skipped++; // duplicate
              else errors.push(`Insert ${row.external_id}: ${insErr.message}`);
            } else {
              inserted++;
            }
          }
        }

        from += BATCH_SIZE;
        if (rows.length < BATCH_SIZE) hasMore = false;
      }
    } else if (payload.provider === "tomtom") {
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = sb
          .from("tomtom_pois")
          .select("*")
          .range(from, from + BATCH_SIZE - 1);

        if (payload.countryCode) {
          query = query.eq("country_code", payload.countryCode);
        }

        const { data: rows, error } = await query;
        if (error) { errors.push(error.message); break; }
        if (!rows || rows.length === 0) { hasMore = false; break; }

        for (const row of rows) {
          const { data: existing } = await sb
            .from("unified_pois")
            .select("id, name, phone, website")
            .eq("source_provider", "tomtom")
            .eq("source_id", row.external_id)
            .maybeSingle();

          if (existing) {
            const updates: Record<string, unknown> = {};
            if (!existing.phone && row.phone) updates.phone = row.phone;
            if (!existing.website && row.url) updates.website = row.url;
            if (!existing.name && row.name) updates.name = row.name;

            if (Object.keys(updates).length > 0) {
              const { error: upErr } = await sb
                .from("unified_pois")
                .update(updates)
                .eq("id", existing.id);
              if (upErr) errors.push(`Update ${row.external_id}: ${upErr.message}`);
              else updated++;
            } else {
              skipped++;
            }
          } else {
            const { error: insErr } = await sb.from("unified_pois").insert({
              source_provider: "tomtom",
              source_id: row.external_id,
              name: row.name,
              categories: row.categories,
              country_code: row.country_code,
              country: row.country,
              region: row.municipality,
              city: row.municipality_subdivision ?? row.municipality,
              postal_code: row.postal_code,
              street: row.street_name,
              street_number: row.street_number,
              formatted_address: row.formatted_address,
              lat: row.lat,
              lon: row.lon,
              phone: row.phone,
              website: row.url,
              raw_data: row.raw_data,
              source_fetched_at: row.fetched_at,
            });

            if (insErr) {
              if (insErr.code === "23505") skipped++;
              else errors.push(`Insert ${row.external_id}: ${insErr.message}`);
            } else {
              inserted++;
            }
          }
        }

        from += BATCH_SIZE;
        if (rows.length < BATCH_SIZE) hasMore = false;
      }
    }

    const result: GeoMergeResponse = { inserted, updated, skipped, errors };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Merge failed" },
      { status: 500 }
    );
  }
}
