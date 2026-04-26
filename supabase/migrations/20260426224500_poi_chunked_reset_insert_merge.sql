-- v4.1.6 POI provider -> unified_pois chunked reset+insert merge.
-- Purpose: avoid PostgREST / PostgreSQL statement timeouts during 50k+ POI merges.
-- This migration is intentionally additive and safe to run after v4.1.5.

create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ */
/*  Safe cast helpers, repeated here so this hotfix is self-contained.  */
/* ------------------------------------------------------------------ */

create or replace function public.__poi_jsonb_or(p_value text, p_fallback jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return p_fallback;
  end if;
  return p_value::jsonb;
exception when others then
  return p_fallback;
end;
$$;

create or replace function public.__poi_bool_safe(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text := lower(nullif(btrim(coalesce(p_value, '')), ''));
begin
  if v is null then return null; end if;
  if v in ('true','t','yes','y','1','on') then return true; end if;
  if v in ('false','f','no','n','0','off') then return false; end if;
  return null;
end;
$$;

create or replace function public.__poi_double_safe(p_value text)
returns double precision
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::double precision;
exception when others then
  return null;
end;
$$;

create or replace function public.__poi_int_safe(p_value text)
returns integer
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::numeric::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.__poi_bigint_safe(p_value text)
returns bigint
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::numeric::bigint;
exception when others then
  return null;
end;
$$;

create or replace function public.__poi_timestamptz_safe(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

/* ------------------------------------------------------------------ */
/*  Indexes needed by the chunk cursor and verification queries.        */
/* ------------------------------------------------------------------ */

create index if not exists geoapify_pois_external_id_idx on public.geoapify_pois (external_id);
create index if not exists geoapify_pois_country_external_id_idx on public.geoapify_pois (country_code, external_id);
create index if not exists tomtom_pois_external_id_idx on public.tomtom_pois (external_id);
create index if not exists tomtom_pois_country_external_id_idx on public.tomtom_pois (country_code, external_id);
create index if not exists unified_pois_source_provider_source_id_idx on public.unified_pois (source_provider, source_id);
create index if not exists unified_pois_last_merge_session_idx on public.unified_pois (last_merge_session);
create index if not exists unified_pois_source_provider_country_idx on public.unified_pois (source_provider, country_code);

/* ------------------------------------------------------------------ */
/*  1) Reset selected provider/country target rows and return counts.   */
/* ------------------------------------------------------------------ */

create or replace function public.reset_provider_pois_to_unified_merge(
  p_provider text,
  p_country_code text default null,
  p_session_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_country text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_raw_source_count integer := 0;
  v_expected_count integer := 0;
  v_duplicate_source_keys integer := 0;
  v_deleted integer := 0;
begin
  perform set_config('statement_timeout', '0', true);

  if v_provider not in ('geoapify', 'tomtom') then
    return jsonb_build_object(
      'status', 'FAILED', 'success', false, 'provider', p_provider, 'countryCode', v_country,
      'merge_session_id', p_session_id::text, 'raw_source_count', 0, 'expected_count', 0,
      'duplicate_source_keys', 0, 'deleted', 0,
      'errors', jsonb_build_array('provider must be geoapify or tomtom'),
      'merge_logs', jsonb_build_array()
    );
  end if;

  if v_provider = 'geoapify' then
    select count(*)::integer,
           count(distinct external_id::text)::integer,
           greatest(count(*)::integer - count(distinct external_id::text)::integer, 0)
      into v_raw_source_count, v_expected_count, v_duplicate_source_keys
    from public.geoapify_pois
    where external_id is not null
      and (v_country is null or upper(country_code::text) = v_country);

    if v_country is null then
      delete from public.unified_pois u where u.source_provider = 'geoapify';
    else
      delete from public.unified_pois u
      where u.source_provider = 'geoapify'
        and exists (
          select 1
          from public.geoapify_pois g
          where g.external_id is not null
            and g.external_id::text = u.source_id
            and upper(g.country_code::text) = v_country
        );
    end if;
  else
    select count(*)::integer,
           count(distinct external_id::text)::integer,
           greatest(count(*)::integer - count(distinct external_id::text)::integer, 0)
      into v_raw_source_count, v_expected_count, v_duplicate_source_keys
    from public.tomtom_pois
    where external_id is not null
      and (v_country is null or upper(country_code::text) = v_country);

    if v_country is null then
      delete from public.unified_pois u where u.source_provider = 'tomtom';
    else
      delete from public.unified_pois u
      where u.source_provider = 'tomtom'
        and exists (
          select 1
          from public.tomtom_pois t
          where t.external_id is not null
            and t.external_id::text = u.source_id
            and upper(t.country_code::text) = v_country
        );
    end if;
  end if;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'status', 'READY',
    'success', true,
    'provider', v_provider,
    'countryCode', v_country,
    'merge_session_id', p_session_id::text,
    'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count,
    'duplicate_source_keys', v_duplicate_source_keys,
    'deleted', v_deleted,
    'next_cursor', null,
    'has_more', v_expected_count > 0,
    'errors', '[]'::jsonb,
    'merge_logs', jsonb_build_array(
      'Reset session ' || p_session_id::text || ' for provider=' || v_provider || coalesce(', country=' || v_country, ', country=ALL'),
      'Raw source rows: ' || v_raw_source_count,
      'Expected distinct source_id rows: ' || v_expected_count,
      'Deleted old unified rows for selected scope: ' || v_deleted
    )
  );
exception when others then
  return jsonb_build_object(
    'status', 'FAILED', 'success', false, 'provider', v_provider, 'countryCode', v_country,
    'merge_session_id', p_session_id::text, 'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count, 'duplicate_source_keys', v_duplicate_source_keys,
    'deleted', v_deleted,
    'errors', jsonb_build_array('Reset failed: ' || sqlerrm),
    'merge_logs', jsonb_build_array('FAILED in reset_provider_pois_to_unified_merge: ' || sqlerrm)
  );
end;
$$;

/* ------------------------------------------------------------------ */
/*  2) Insert one deterministic provider chunk into unified_pois.       */
/* ------------------------------------------------------------------ */

create or replace function public.insert_provider_pois_to_unified_chunk(
  p_provider text,
  p_country_code text default null,
  p_session_id uuid default gen_random_uuid(),
  p_after_source_id text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_country text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_after text := nullif(p_after_source_id, '');
  v_limit integer := greatest(100, least(coalesce(p_limit, 1000), 5000));
  v_processed integer := 0;
  v_inserted integer := 0;
  v_next_cursor text := null;
  v_has_more boolean := false;
  v_now timestamptz := now();
begin
  perform set_config('statement_timeout', '0', true);

  if v_provider not in ('geoapify', 'tomtom') then
    return jsonb_build_object(
      'status', 'FAILED', 'success', false, 'provider', p_provider, 'countryCode', v_country,
      'merge_session_id', p_session_id::text, 'processed', 0, 'inserted', 0,
      'next_cursor', v_after, 'has_more', false,
      'errors', jsonb_build_array('provider must be geoapify or tomtom'),
      'merge_logs', jsonb_build_array()
    );
  end if;

  drop table if exists tmp_poi_chunk;
  create temporary table tmp_poi_chunk (
    source_provider text,
    source_id text,
    name text,
    name_international jsonb,
    categories jsonb,
    country text,
    country_code text,
    country_code_iso3 text,
    iso3166_2 text,
    state_region text,
    city text,
    district text,
    suburb text,
    postal_code text,
    street text,
    street_number text,
    formatted_address text,
    address_line1 text,
    address_line2 text,
    lat double precision,
    lon double precision,
    phone text,
    email text,
    website text,
    facebook text,
    instagram text,
    tripadvisor text,
    opening_hours jsonb,
    operator text,
    brand text,
    branch text,
    cuisine text,
    diet jsonb,
    capacity integer,
    reservation text,
    wheelchair text,
    outdoor_seating boolean,
    indoor_seating boolean,
    internet_access boolean,
    air_conditioning boolean,
    smoking text,
    toilets text,
    takeaway boolean,
    delivery boolean,
    payment_options jsonb,
    classification_code text,
    osm_id bigint,
    building_type text,
    raw_data jsonb,
    source_fetched_at timestamptz
  ) on commit drop;

  if v_provider = 'geoapify' then
    insert into tmp_poi_chunk
    select distinct on (g.external_id::text)
      'geoapify',
      g.external_id::text,
      nullif(g.name::text, ''),
      public.__poi_jsonb_or(g.name_international::text, '{}'::jsonb),
      public.__poi_jsonb_or(g.categories::text, '[]'::jsonb),
      nullif(g.country::text, ''),
      upper(nullif(g.country_code::text, '')),
      null,
      nullif(g.iso3166_2::text, ''),
      nullif(g.state::text, ''),
      nullif(g.city::text, ''),
      nullif(g.district::text, ''),
      nullif(g.suburb::text, ''),
      nullif(g.postcode::text, ''),
      nullif(g.street::text, ''),
      nullif(g.housenumber::text, ''),
      nullif(g.formatted_address::text, ''),
      nullif(g.address_line1::text, ''),
      nullif(g.address_line2::text, ''),
      public.__poi_double_safe(g.lat::text),
      public.__poi_double_safe(g.lon::text),
      nullif(g.phone::text, ''),
      nullif(g.email::text, ''),
      nullif(g.website::text, ''),
      nullif(g.facebook::text, ''),
      nullif(g.instagram::text, ''),
      nullif(g.tripadvisor::text, ''),
      public.__poi_jsonb_or(g.opening_hours::text, null::jsonb),
      nullif(g.operator::text, ''),
      nullif(g.brand::text, ''),
      nullif(g.branch::text, ''),
      nullif(g.cuisine::text, ''),
      public.__poi_jsonb_or(g.diet::text, '{}'::jsonb),
      public.__poi_int_safe(g.capacity::text),
      nullif(g.reservation::text, ''),
      nullif(g.wheelchair::text, ''),
      public.__poi_bool_safe(g.outdoor_seating::text),
      public.__poi_bool_safe(g.indoor_seating::text),
      public.__poi_bool_safe(g.internet_access::text),
      public.__poi_bool_safe(g.air_conditioning::text),
      nullif(g.smoking::text, ''),
      nullif(g.toilets::text, ''),
      public.__poi_bool_safe(g.takeaway::text),
      public.__poi_bool_safe(g.delivery::text),
      public.__poi_jsonb_or(g.payment_options::text, '{}'::jsonb),
      null,
      public.__poi_bigint_safe(g.osm_id::text),
      nullif(g.building_type::text, ''),
      public.__poi_jsonb_or(g.raw_data::text, '{}'::jsonb),
      public.__poi_timestamptz_safe(g.fetched_at::text)
    from public.geoapify_pois g
    where g.external_id is not null
      and (v_after is null or g.external_id::text > v_after)
      and (v_country is null or upper(g.country_code::text) = v_country)
    order by g.external_id::text, public.__poi_timestamptz_safe(g.fetched_at::text) desc nulls last
    limit v_limit;
  else
    insert into tmp_poi_chunk
    select distinct on (t.external_id::text)
      'tomtom',
      t.external_id::text,
      nullif(t.name::text, ''),
      '{}'::jsonb,
      public.__poi_jsonb_or(t.categories::text, '[]'::jsonb),
      nullif(t.country::text, ''),
      upper(nullif(t.country_code::text, '')),
      nullif(t.country_code_iso3::text, ''),
      null,
      coalesce(nullif(t.country_subdivision_name::text, ''), nullif(t.country_subdivision::text, '')),
      nullif(t.municipality::text, ''),
      nullif(t.municipality_subdivision::text, ''),
      nullif(t.municipality_secondary_subdivision::text, ''),
      nullif(t.postal_code::text, ''),
      nullif(t.street_name::text, ''),
      nullif(t.street_number::text, ''),
      nullif(t.freeform_address::text, ''),
      nullif(t.name::text, ''),
      nullif(t.freeform_address::text, ''),
      public.__poi_double_safe(t.lat::text),
      public.__poi_double_safe(t.lon::text),
      nullif(t.phone::text, ''),
      null,
      nullif(t.url::text, ''),
      null,
      null,
      null,
      public.__poi_jsonb_or(t.opening_hours::text, null::jsonb),
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      coalesce(
        nullif(public.__poi_jsonb_or(t.classifications::text, '[]'::jsonb)->0->>'code', ''),
        nullif(public.__poi_jsonb_or(t.category_set::text, '[]'::jsonb)->0->>'id', '')
      ),
      null,
      null,
      public.__poi_jsonb_or(t.raw_data::text, '{}'::jsonb),
      public.__poi_timestamptz_safe(t.fetched_at::text)
    from public.tomtom_pois t
    where t.external_id is not null
      and (v_after is null or t.external_id::text > v_after)
      and (v_country is null or upper(t.country_code::text) = v_country)
    order by t.external_id::text, public.__poi_timestamptz_safe(t.fetched_at::text) desc nulls last
    limit v_limit;
  end if;

  select count(*)::integer, max(source_id) into v_processed, v_next_cursor from tmp_poi_chunk;

  if v_processed > 0 then
    insert into public.unified_pois (
      source_provider, source_id, name, name_international, categories, country, country_code,
      country_code_iso3, iso3166_2, state_region, city, district, suburb, postal_code, street,
      street_number, formatted_address, address_line1, address_line2, lat, lon, phone, email,
      website, facebook, instagram, tripadvisor, opening_hours, operator, brand, branch, cuisine,
      diet, capacity, reservation, wheelchair, outdoor_seating, indoor_seating, internet_access,
      air_conditioning, smoking, toilets, takeaway, delivery, payment_options, classification_code,
      osm_id, building_type, raw_data, source_fetched_at, unified_at, last_merge_session,
      last_merged_at, created_at, updated_at
    )
    select
      source_provider, source_id, name, name_international, categories, country, country_code,
      country_code_iso3, iso3166_2, state_region, city, district, suburb, postal_code, street,
      street_number, formatted_address, address_line1, address_line2, lat, lon, phone, email,
      website, facebook, instagram, tripadvisor, opening_hours, operator, brand, branch, cuisine,
      diet, capacity, reservation, wheelchair, outdoor_seating, indoor_seating, internet_access,
      air_conditioning, smoking, toilets, takeaway, delivery, payment_options, classification_code,
      osm_id, building_type, raw_data, source_fetched_at, v_now, p_session_id,
      v_now, v_now, v_now
    from tmp_poi_chunk
    order by source_id;
    get diagnostics v_inserted = row_count;
  end if;

  if v_processed > 0 then
    if v_provider = 'geoapify' then
      select exists(
        select 1 from public.geoapify_pois g
        where g.external_id is not null
          and g.external_id::text > v_next_cursor
          and (v_country is null or upper(g.country_code::text) = v_country)
      ) into v_has_more;
    else
      select exists(
        select 1 from public.tomtom_pois t
        where t.external_id is not null
          and t.external_id::text > v_next_cursor
          and (v_country is null or upper(t.country_code::text) = v_country)
      ) into v_has_more;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'CHUNK_DONE',
    'success', true,
    'provider', v_provider,
    'countryCode', v_country,
    'merge_session_id', p_session_id::text,
    'processed', v_processed,
    'inserted', v_inserted,
    'next_cursor', v_next_cursor,
    'has_more', v_has_more,
    'errors', '[]'::jsonb,
    'merge_logs', jsonb_build_array(
      'Inserted chunk after cursor ' || coalesce(v_after, '<START>') || ': processed=' || v_processed || ', inserted=' || v_inserted || ', next_cursor=' || coalesce(v_next_cursor, '<END>')
    )
  );
exception when others then
  return jsonb_build_object(
    'status', 'FAILED', 'success', false, 'provider', v_provider, 'countryCode', v_country,
    'merge_session_id', p_session_id::text, 'processed', v_processed, 'inserted', v_inserted,
    'next_cursor', v_after, 'has_more', false,
    'errors', jsonb_build_array('Chunk insert failed: ' || sqlerrm),
    'merge_logs', jsonb_build_array('FAILED in insert_provider_pois_to_unified_chunk after cursor ' || coalesce(v_after, '<START>') || ': ' || sqlerrm)
  );
end;
$$;

/* ------------------------------------------------------------------ */
/*  3) Verify session count after all chunks.                           */
/* ------------------------------------------------------------------ */

create or replace function public.finish_provider_pois_to_unified_merge(
  p_provider text,
  p_country_code text default null,
  p_session_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_country text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_raw_source_count integer := 0;
  v_expected_count integer := 0;
  v_duplicate_source_keys integer := 0;
  v_found integer := 0;
  v_missing integer := 0;
begin
  perform set_config('statement_timeout', '0', true);

  if v_provider = 'geoapify' then
    select count(*)::integer,
           count(distinct external_id::text)::integer,
           greatest(count(*)::integer - count(distinct external_id::text)::integer, 0)
      into v_raw_source_count, v_expected_count, v_duplicate_source_keys
    from public.geoapify_pois
    where external_id is not null
      and (v_country is null or upper(country_code::text) = v_country);
  elsif v_provider = 'tomtom' then
    select count(*)::integer,
           count(distinct external_id::text)::integer,
           greatest(count(*)::integer - count(distinct external_id::text)::integer, 0)
      into v_raw_source_count, v_expected_count, v_duplicate_source_keys
    from public.tomtom_pois
    where external_id is not null
      and (v_country is null or upper(country_code::text) = v_country);
  else
    return jsonb_build_object(
      'status', 'FAILED', 'success', false, 'provider', p_provider, 'countryCode', v_country,
      'merge_session_id', p_session_id::text, 'raw_source_count', 0, 'expected_count', 0,
      'found_count', 0, 'missing_count', 0, 'duplicate_source_keys', 0,
      'errors', jsonb_build_array('provider must be geoapify or tomtom'),
      'merge_logs', jsonb_build_array()
    );
  end if;

  select count(distinct source_id)::integer into v_found
  from public.unified_pois
  where source_provider = v_provider
    and last_merge_session = p_session_id
    and (v_country is null or upper(coalesce(country_code, '')) = v_country);

  v_missing := greatest(v_expected_count - v_found, 0);

  return jsonb_build_object(
    'status', case when v_missing = 0 then 'SUCCESS' else 'FAILED' end,
    'success', v_missing = 0,
    'provider', v_provider,
    'countryCode', v_country,
    'merge_session_id', p_session_id::text,
    'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count,
    'found_count', v_found,
    'missing_count', v_missing,
    'inserted', v_found,
    'updated', 0,
    'skipped', greatest(v_raw_source_count - v_expected_count, 0),
    'duplicate_source_keys', v_duplicate_source_keys,
    'errors', case when v_missing = 0 then '[]'::jsonb else jsonb_build_array('Post-merge validation failed: expected ' || v_expected_count || ', found ' || v_found || ', missing ' || v_missing) end,
    'merge_logs', jsonb_build_array(
      'Final verification for session ' || p_session_id::text || ', provider=' || v_provider || coalesce(', country=' || v_country, ', country=ALL'),
      'Raw source rows: ' || v_raw_source_count,
      'Expected distinct source_id rows: ' || v_expected_count,
      'Found rows by last_merge_session: ' || v_found,
      'Missing rows: ' || v_missing
    )
  );
exception when others then
  return jsonb_build_object(
    'status', 'FAILED', 'success', false, 'provider', v_provider, 'countryCode', v_country,
    'merge_session_id', p_session_id::text, 'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count, 'found_count', v_found, 'missing_count', v_missing,
    'duplicate_source_keys', v_duplicate_source_keys,
    'errors', jsonb_build_array('Final verification failed: ' || sqlerrm),
    'merge_logs', jsonb_build_array('FAILED in finish_provider_pois_to_unified_merge: ' || sqlerrm)
  );
end;
$$;

comment on function public.reset_provider_pois_to_unified_merge(text, text, uuid) is
  'v4.1.6: clears selected provider/country unified rows and returns raw/distinct source counts before chunked insert.';
comment on function public.insert_provider_pois_to_unified_chunk(text, text, uuid, text, integer) is
  'v4.1.6: inserts one deterministic raw provider chunk into unified_pois using source_id cursor pagination.';
comment on function public.finish_provider_pois_to_unified_merge(text, text, uuid) is
  'v4.1.6: verifies exact source distinct count equals target last_merge_session count.';
