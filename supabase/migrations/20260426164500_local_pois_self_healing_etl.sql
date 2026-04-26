-- Robust local_pois target support for self-healing unified_pois -> local_pois ETL.
-- Safe to run more than once in Supabase SQL Editor.
-- It adds only missing columns/indexes and does not delete existing data.

create extension if not exists pgcrypto;

create table if not exists public.local_pois (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  source_provider text not null,
  name text,
  name_international jsonb default '{}'::jsonb,
  categories jsonb default '[]'::jsonb,
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
  diet jsonb default '{}'::jsonb,
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
  payment_options jsonb default '{}'::jsonb,
  classification_code text,
  osm_id bigint,
  building_type text,
  raw_data jsonb,
  source_fetched_at timestamptz,
  source_unified_at timestamptz,
  last_load_session uuid,
  last_loaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.local_pois add column if not exists id uuid default gen_random_uuid();
alter table public.local_pois add column if not exists provider_id text;
alter table public.local_pois add column if not exists source_provider text;
alter table public.local_pois add column if not exists name text;
alter table public.local_pois add column if not exists name_international jsonb default '{}'::jsonb;
alter table public.local_pois add column if not exists categories jsonb default '[]'::jsonb;
alter table public.local_pois add column if not exists country text;
alter table public.local_pois add column if not exists country_code text;
alter table public.local_pois add column if not exists country_code_iso3 text;
alter table public.local_pois add column if not exists iso3166_2 text;
alter table public.local_pois add column if not exists state_region text;
alter table public.local_pois add column if not exists city text;
alter table public.local_pois add column if not exists district text;
alter table public.local_pois add column if not exists suburb text;
alter table public.local_pois add column if not exists postal_code text;
alter table public.local_pois add column if not exists street text;
alter table public.local_pois add column if not exists street_number text;
alter table public.local_pois add column if not exists formatted_address text;
alter table public.local_pois add column if not exists address_line1 text;
alter table public.local_pois add column if not exists address_line2 text;
alter table public.local_pois add column if not exists lat double precision;
alter table public.local_pois add column if not exists lon double precision;
alter table public.local_pois add column if not exists phone text;
alter table public.local_pois add column if not exists email text;
alter table public.local_pois add column if not exists website text;
alter table public.local_pois add column if not exists facebook text;
alter table public.local_pois add column if not exists instagram text;
alter table public.local_pois add column if not exists tripadvisor text;
alter table public.local_pois add column if not exists opening_hours jsonb;
alter table public.local_pois add column if not exists operator text;
alter table public.local_pois add column if not exists brand text;
alter table public.local_pois add column if not exists branch text;
alter table public.local_pois add column if not exists cuisine text;
alter table public.local_pois add column if not exists diet jsonb default '{}'::jsonb;
alter table public.local_pois add column if not exists capacity integer;
alter table public.local_pois add column if not exists reservation text;
alter table public.local_pois add column if not exists wheelchair text;
alter table public.local_pois add column if not exists outdoor_seating boolean;
alter table public.local_pois add column if not exists indoor_seating boolean;
alter table public.local_pois add column if not exists internet_access boolean;
alter table public.local_pois add column if not exists air_conditioning boolean;
alter table public.local_pois add column if not exists smoking text;
alter table public.local_pois add column if not exists toilets text;
alter table public.local_pois add column if not exists takeaway boolean;
alter table public.local_pois add column if not exists delivery boolean;
alter table public.local_pois add column if not exists payment_options jsonb default '{}'::jsonb;
alter table public.local_pois add column if not exists classification_code text;
alter table public.local_pois add column if not exists osm_id bigint;
alter table public.local_pois add column if not exists building_type text;
alter table public.local_pois add column if not exists raw_data jsonb;
alter table public.local_pois add column if not exists source_fetched_at timestamptz;
alter table public.local_pois add column if not exists source_unified_at timestamptz;
alter table public.local_pois add column if not exists last_load_session uuid;
alter table public.local_pois add column if not exists last_loaded_at timestamptz;
alter table public.local_pois add column if not exists created_at timestamptz not null default now();
alter table public.local_pois add column if not exists updated_at timestamptz not null default now();

update public.local_pois
set provider_id = coalesce(provider_id, id::text)
where provider_id is null;

update public.local_pois
set source_provider = coalesce(source_provider, 'unknown')
where source_provider is null;

alter table public.local_pois alter column provider_id set not null;
alter table public.local_pois alter column source_provider set not null;

create unique index if not exists local_pois_provider_source_uidx
  on public.local_pois (provider_id, source_provider);

create index if not exists local_pois_last_load_session_idx
  on public.local_pois (last_load_session);

create index if not exists local_pois_source_provider_country_idx
  on public.local_pois (source_provider, country_code);

comment on column public.local_pois.last_load_session is
  'ETL session UUID. Updated on every current-run UPSERT so exact current-run target parity can be verified.';

-- v4.1.0 POI merge hardening: session-backed verification for raw provider -> unified_pois.
-- Safe append-only additions. They do not delete or rewrite existing POI data.
alter table public.unified_pois add column if not exists last_merge_session uuid;
alter table public.unified_pois add column if not exists last_merged_at timestamptz;

create index if not exists unified_pois_last_merge_session_idx
  on public.unified_pois (last_merge_session);

create index if not exists unified_pois_source_provider_country_idx
  on public.unified_pois (source_provider, country_code);

create index if not exists unified_pois_source_provider_source_id_idx
  on public.unified_pois (source_provider, source_id);

-- Do not force a unique index on unified_pois here: older failed merges may have duplicates.
-- The database-side merge function below uses UPDATE + INSERT WHERE NOT EXISTS and validates by distinct source keys.

create index if not exists geoapify_pois_external_id_idx
  on public.geoapify_pois (external_id);

create index if not exists geoapify_pois_country_external_id_idx
  on public.geoapify_pois (country_code, external_id);

create index if not exists tomtom_pois_external_id_idx
  on public.tomtom_pois (external_id);

create index if not exists tomtom_pois_country_external_id_idx
  on public.tomtom_pois (country_code, external_id);

create table if not exists public.poi_etl_errors (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  provider text,
  source_id text,
  phase text not null,
  error_message text not null,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists poi_etl_errors_job_id_idx
  on public.poi_etl_errors (job_id);

comment on column public.unified_pois.last_merge_session is
  'Merge session UUID. Updated on every current-run UPSERT so raw provider -> unified parity can be verified.';

-- v4.1.2 POI provider -> unified_pois database-side bulk merge.
-- This replaces the timeout-prone Next.js/PostgREST row/chunk merge with a set-based
-- INSERT INTO ... SELECT FROM database operation. It is intentionally idempotent and
-- validates by DISTINCT provider/source keys for the current last_merge_session.
alter table public.unified_pois add column if not exists unified_at timestamptz;

create or replace function public.merge_provider_pois_to_unified(
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
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_country_code text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_started_at timestamptz := clock_timestamp();
  v_now timestamptz := now();
  v_raw_source_count bigint := 0;
  v_expected_count bigint := 0;
  v_found_count bigint := 0;
  v_inserted bigint := 0;
  v_updated bigint := 0;
  v_skipped bigint := 0;
  v_failed bigint := 0;
  v_duplicate_source_keys bigint := 0;
  v_errors text[] := array[]::text[];
  v_logs text[] := array[]::text[];
begin
  if v_provider not in ('geoapify', 'tomtom') then
    return jsonb_build_object(
      'status', 'FAILED',
      'success', false,
      'load_session_id', p_session_id::text,
      'provider', coalesce(p_provider, 'unknown'),
      'countryCode', v_country_code,
      'inserted', 0,
      'updated', 0,
      'skipped', 0,
      'errors', jsonb_build_array('provider must be geoapify or tomtom'),
      'retry_logs', jsonb_build_array('Database-side merge did not start because provider was invalid.'),
      'raw_source_count', 0,
      'expected_count', 0,
      'found_count', 0,
      'missing_count', 0,
      'upserted', 0,
      'failed', 0,
      'duplicate_source_keys', 0,
      'attempts', 0,
      'duration_ms', 0
    );
  end if;

  lock table public.unified_pois in share row exclusive mode;

  v_logs := array_append(v_logs, format(
    'Database-side set merge started. provider=%s, country=%s, session=%s.',
    v_provider,
    coalesce(v_country_code, 'ALL'),
    p_session_id::text
  ));

  if v_provider = 'geoapify' then
    select count(*), count(distinct external_id)
      into v_raw_source_count, v_expected_count
    from public.geoapify_pois
    where external_id is not null
      and (v_country_code is null or country_code = v_country_code);

    v_duplicate_source_keys := greatest(v_raw_source_count - v_expected_count, 0);

    with src as (
      select distinct on (g.external_id)
        g.external_id::text as source_id,
        g.name,
        coalesce(g.name_international, '{}'::jsonb) as name_international,
        coalesce(g.categories, '[]'::jsonb) as categories,
        g.country,
        g.country_code,
        null::text as country_code_iso3,
        g.iso3166_2,
        g.state as state_region,
        g.city,
        g.district,
        g.suburb,
        g.postcode as postal_code,
        g.street,
        g.housenumber as street_number,
        g.formatted_address,
        g.address_line1,
        g.address_line2,
        g.lat,
        g.lon,
        g.phone,
        g.email,
        g.website,
        g.facebook,
        g.instagram,
        g.tripadvisor,
        case when g.opening_hours is null then null else to_jsonb(g.opening_hours) end as opening_hours,
        g.operator,
        g.brand,
        g.branch,
        g.cuisine,
        coalesce(g.diet, '{}'::jsonb) as diet,
        g.capacity,
        g.reservation,
        g.wheelchair,
        g.outdoor_seating,
        g.indoor_seating,
        g.internet_access,
        g.air_conditioning,
        g.smoking,
        g.toilets,
        g.takeaway,
        g.delivery,
        coalesce(g.payment_options, '{}'::jsonb) as payment_options,
        null::text as classification_code,
        g.osm_id,
        g.building_type,
        coalesce(g.raw_data, to_jsonb(g)) as raw_data,
        g.fetched_at as source_fetched_at
      from public.geoapify_pois g
      where g.external_id is not null
        and (v_country_code is null or g.country_code = v_country_code)
      order by g.external_id, g.fetched_at desc nulls last, g.id desc
    ), updated_rows as (
      update public.unified_pois u
      set
        name = coalesce(src.name, u.name),
        name_international = case when src.name_international is null or src.name_international = '{}'::jsonb then u.name_international else src.name_international end,
        categories = case when src.categories is null or src.categories = '[]'::jsonb then u.categories else src.categories end,
        country = coalesce(src.country, u.country),
        country_code = coalesce(src.country_code, u.country_code),
        country_code_iso3 = coalesce(src.country_code_iso3, u.country_code_iso3),
        iso3166_2 = coalesce(src.iso3166_2, u.iso3166_2),
        state_region = coalesce(src.state_region, u.state_region),
        city = coalesce(src.city, u.city),
        district = coalesce(src.district, u.district),
        suburb = coalesce(src.suburb, u.suburb),
        postal_code = coalesce(src.postal_code, u.postal_code),
        street = coalesce(src.street, u.street),
        street_number = coalesce(src.street_number, u.street_number),
        formatted_address = coalesce(src.formatted_address, u.formatted_address),
        address_line1 = coalesce(src.address_line1, u.address_line1),
        address_line2 = coalesce(src.address_line2, u.address_line2),
        lat = coalesce(src.lat, u.lat),
        lon = coalesce(src.lon, u.lon),
        phone = coalesce(src.phone, u.phone),
        email = coalesce(src.email, u.email),
        website = coalesce(src.website, u.website),
        facebook = coalesce(src.facebook, u.facebook),
        instagram = coalesce(src.instagram, u.instagram),
        tripadvisor = coalesce(src.tripadvisor, u.tripadvisor),
        opening_hours = coalesce(src.opening_hours, u.opening_hours),
        operator = coalesce(src.operator, u.operator),
        brand = coalesce(src.brand, u.brand),
        branch = coalesce(src.branch, u.branch),
        cuisine = coalesce(src.cuisine, u.cuisine),
        diet = case when src.diet is null or src.diet = '{}'::jsonb then u.diet else src.diet end,
        capacity = coalesce(src.capacity, u.capacity),
        reservation = coalesce(src.reservation, u.reservation),
        wheelchair = coalesce(src.wheelchair, u.wheelchair),
        outdoor_seating = coalesce(src.outdoor_seating, u.outdoor_seating),
        indoor_seating = coalesce(src.indoor_seating, u.indoor_seating),
        internet_access = coalesce(src.internet_access, u.internet_access),
        air_conditioning = coalesce(src.air_conditioning, u.air_conditioning),
        smoking = coalesce(src.smoking, u.smoking),
        toilets = coalesce(src.toilets, u.toilets),
        takeaway = coalesce(src.takeaway, u.takeaway),
        delivery = coalesce(src.delivery, u.delivery),
        payment_options = case when src.payment_options is null or src.payment_options = '{}'::jsonb then u.payment_options else src.payment_options end,
        classification_code = coalesce(src.classification_code, u.classification_code),
        osm_id = coalesce(src.osm_id, u.osm_id),
        building_type = coalesce(src.building_type, u.building_type),
        raw_data = coalesce(src.raw_data, u.raw_data),
        source_fetched_at = coalesce(src.source_fetched_at, u.source_fetched_at),
        unified_at = v_now,
        last_merge_session = p_session_id,
        last_merged_at = v_now
      from src
      where u.source_provider = 'geoapify'
        and u.source_id = src.source_id
      returning u.source_id
    ), inserted_rows as (
      insert into public.unified_pois (
        source_provider, source_id, name, name_international, categories, country, country_code,
        country_code_iso3, iso3166_2, state_region, city, district, suburb, postal_code,
        street, street_number, formatted_address, address_line1, address_line2, lat, lon,
        phone, email, website, facebook, instagram, tripadvisor, opening_hours, operator,
        brand, branch, cuisine, diet, capacity, reservation, wheelchair, outdoor_seating,
        indoor_seating, internet_access, air_conditioning, smoking, toilets, takeaway,
        delivery, payment_options, classification_code, osm_id, building_type, raw_data,
        source_fetched_at, unified_at, last_merge_session, last_merged_at
      )
      select
        'geoapify', source_id, name, name_international, categories, country, country_code,
        country_code_iso3, iso3166_2, state_region, city, district, suburb, postal_code,
        street, street_number, formatted_address, address_line1, address_line2, lat, lon,
        phone, email, website, facebook, instagram, tripadvisor, opening_hours, operator,
        brand, branch, cuisine, diet, capacity, reservation, wheelchair, outdoor_seating,
        indoor_seating, internet_access, air_conditioning, smoking, toilets, takeaway,
        delivery, payment_options, classification_code, osm_id, building_type, raw_data,
        source_fetched_at, v_now, p_session_id, v_now
      from src
      where not exists (
        select 1
        from public.unified_pois u
        where u.source_provider = 'geoapify'
          and u.source_id = src.source_id
      )
      returning source_id
    )
    select (select count(*) from updated_rows), (select count(*) from inserted_rows)
      into v_updated, v_inserted;

    select count(distinct source_id)
      into v_found_count
    from public.unified_pois
    where source_provider = 'geoapify'
      and last_merge_session = p_session_id
      and (v_country_code is null or country_code = v_country_code);

  elsif v_provider = 'tomtom' then
    select count(*), count(distinct external_id)
      into v_raw_source_count, v_expected_count
    from public.tomtom_pois
    where external_id is not null
      and (v_country_code is null or country_code = v_country_code);

    v_duplicate_source_keys := greatest(v_raw_source_count - v_expected_count, 0);

    with src as (
      select distinct on (t.external_id)
        t.external_id::text as source_id,
        t.name,
        '{}'::jsonb as name_international,
        coalesce(t.categories, '[]'::jsonb) as categories,
        t.country,
        t.country_code,
        t.country_code_iso3,
        null::text as iso3166_2,
        coalesce(t.country_subdivision_name, t.country_subdivision) as state_region,
        t.municipality as city,
        t.municipality_subdivision as district,
        t.municipality_secondary_subdivision as suburb,
        t.postal_code,
        t.street_name as street,
        t.street_number,
        t.freeform_address as formatted_address,
        t.name as address_line1,
        t.freeform_address as address_line2,
        t.lat,
        t.lon,
        t.phone,
        null::text as email,
        t.url as website,
        null::text as facebook,
        null::text as instagram,
        null::text as tripadvisor,
        case when t.opening_hours is null then null else to_jsonb(t.opening_hours) end as opening_hours,
        null::text as operator,
        null::text as brand,
        null::text as branch,
        null::text as cuisine,
        '{}'::jsonb as diet,
        null::integer as capacity,
        null::text as reservation,
        null::text as wheelchair,
        null::boolean as outdoor_seating,
        null::boolean as indoor_seating,
        null::boolean as internet_access,
        null::boolean as air_conditioning,
        null::text as smoking,
        null::text as toilets,
        null::boolean as takeaway,
        null::boolean as delivery,
        '{}'::jsonb as payment_options,
        case
          when jsonb_typeof(t.classifications) = 'array' then t.classifications -> 0 ->> 'code'
          else null
        end as classification_code,
        null::bigint as osm_id,
        null::text as building_type,
        coalesce(t.raw_data, to_jsonb(t)) as raw_data,
        t.fetched_at as source_fetched_at
      from public.tomtom_pois t
      where t.external_id is not null
        and (v_country_code is null or t.country_code = v_country_code)
      order by t.external_id, t.fetched_at desc nulls last, t.id desc
    ), updated_rows as (
      update public.unified_pois u
      set
        name = coalesce(src.name, u.name),
        name_international = coalesce(src.name_international, u.name_international),
        categories = case when src.categories is null or src.categories = '[]'::jsonb then u.categories else src.categories end,
        country = coalesce(src.country, u.country),
        country_code = coalesce(src.country_code, u.country_code),
        country_code_iso3 = coalesce(src.country_code_iso3, u.country_code_iso3),
        iso3166_2 = coalesce(src.iso3166_2, u.iso3166_2),
        state_region = coalesce(src.state_region, u.state_region),
        city = coalesce(src.city, u.city),
        district = coalesce(src.district, u.district),
        suburb = coalesce(src.suburb, u.suburb),
        postal_code = coalesce(src.postal_code, u.postal_code),
        street = coalesce(src.street, u.street),
        street_number = coalesce(src.street_number, u.street_number),
        formatted_address = coalesce(src.formatted_address, u.formatted_address),
        address_line1 = coalesce(src.address_line1, u.address_line1),
        address_line2 = coalesce(src.address_line2, u.address_line2),
        lat = coalesce(src.lat, u.lat),
        lon = coalesce(src.lon, u.lon),
        phone = coalesce(src.phone, u.phone),
        email = coalesce(src.email, u.email),
        website = coalesce(src.website, u.website),
        facebook = coalesce(src.facebook, u.facebook),
        instagram = coalesce(src.instagram, u.instagram),
        tripadvisor = coalesce(src.tripadvisor, u.tripadvisor),
        opening_hours = coalesce(src.opening_hours, u.opening_hours),
        operator = coalesce(src.operator, u.operator),
        brand = coalesce(src.brand, u.brand),
        branch = coalesce(src.branch, u.branch),
        cuisine = coalesce(src.cuisine, u.cuisine),
        diet = coalesce(src.diet, u.diet),
        capacity = coalesce(src.capacity, u.capacity),
        reservation = coalesce(src.reservation, u.reservation),
        wheelchair = coalesce(src.wheelchair, u.wheelchair),
        outdoor_seating = coalesce(src.outdoor_seating, u.outdoor_seating),
        indoor_seating = coalesce(src.indoor_seating, u.indoor_seating),
        internet_access = coalesce(src.internet_access, u.internet_access),
        air_conditioning = coalesce(src.air_conditioning, u.air_conditioning),
        smoking = coalesce(src.smoking, u.smoking),
        toilets = coalesce(src.toilets, u.toilets),
        takeaway = coalesce(src.takeaway, u.takeaway),
        delivery = coalesce(src.delivery, u.delivery),
        payment_options = coalesce(src.payment_options, u.payment_options),
        classification_code = coalesce(src.classification_code, u.classification_code),
        osm_id = coalesce(src.osm_id, u.osm_id),
        building_type = coalesce(src.building_type, u.building_type),
        raw_data = coalesce(src.raw_data, u.raw_data),
        source_fetched_at = coalesce(src.source_fetched_at, u.source_fetched_at),
        unified_at = v_now,
        last_merge_session = p_session_id,
        last_merged_at = v_now
      from src
      where u.source_provider = 'tomtom'
        and u.source_id = src.source_id
      returning u.source_id
    ), inserted_rows as (
      insert into public.unified_pois (
        source_provider, source_id, name, name_international, categories, country, country_code,
        country_code_iso3, iso3166_2, state_region, city, district, suburb, postal_code,
        street, street_number, formatted_address, address_line1, address_line2, lat, lon,
        phone, email, website, facebook, instagram, tripadvisor, opening_hours, operator,
        brand, branch, cuisine, diet, capacity, reservation, wheelchair, outdoor_seating,
        indoor_seating, internet_access, air_conditioning, smoking, toilets, takeaway,
        delivery, payment_options, classification_code, osm_id, building_type, raw_data,
        source_fetched_at, unified_at, last_merge_session, last_merged_at
      )
      select
        'tomtom', source_id, name, name_international, categories, country, country_code,
        country_code_iso3, iso3166_2, state_region, city, district, suburb, postal_code,
        street, street_number, formatted_address, address_line1, address_line2, lat, lon,
        phone, email, website, facebook, instagram, tripadvisor, opening_hours, operator,
        brand, branch, cuisine, diet, capacity, reservation, wheelchair, outdoor_seating,
        indoor_seating, internet_access, air_conditioning, smoking, toilets, takeaway,
        delivery, payment_options, classification_code, osm_id, building_type, raw_data,
        source_fetched_at, v_now, p_session_id, v_now
      from src
      where not exists (
        select 1
        from public.unified_pois u
        where u.source_provider = 'tomtom'
          and u.source_id = src.source_id
      )
      returning source_id
    )
    select (select count(*) from updated_rows), (select count(*) from inserted_rows)
      into v_updated, v_inserted;

    select count(distinct source_id)
      into v_found_count
    from public.unified_pois
    where source_provider = 'tomtom'
      and last_merge_session = p_session_id
      and (v_country_code is null or country_code = v_country_code);
  end if;

  v_logs := array_append(v_logs, format(
    'Database-side set merge completed. raw=%s, expected_distinct=%s, inserted=%s, updated=%s, found_by_session=%s, duplicates=%s.',
    v_raw_source_count,
    v_expected_count,
    v_inserted,
    v_updated,
    v_found_count,
    v_duplicate_source_keys
  ));

  if v_found_count = v_expected_count then
    v_logs := array_append(v_logs, 'SUCCESS: unified_pois last_merge_session distinct count equals raw source distinct key count exactly.');
  else
    v_errors := array_append(v_errors, format(
      'FAILED: expected distinct %s, found %s, missing %s.',
      v_expected_count,
      v_found_count,
      greatest(v_expected_count - v_found_count, 0)
    ));
  end if;

  return jsonb_build_object(
    'status', case when v_found_count = v_expected_count then 'SUCCESS' else 'FAILED' end,
    'success', v_found_count = v_expected_count,
    'load_session_id', p_session_id::text,
    'provider', v_provider,
    'countryCode', v_country_code,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', to_jsonb(v_errors),
    'retry_logs', to_jsonb(v_logs),
    'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count,
    'found_count', v_found_count,
    'missing_count', greatest(v_expected_count - v_found_count, 0),
    'upserted', v_inserted + v_updated,
    'failed', v_failed,
    'duplicate_source_keys', v_duplicate_source_keys,
    'attempts', 1,
    'duration_ms', floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::bigint
  );
exception when others then
  return jsonb_build_object(
    'status', 'FAILED',
    'success', false,
    'load_session_id', p_session_id::text,
    'provider', v_provider,
    'countryCode', v_country_code,
    'inserted', 0,
    'updated', 0,
    'skipped', 0,
    'errors', jsonb_build_array(format('Database-side merge failed: %s', sqlerrm)),
    'retry_logs', jsonb_build_array(format('Database-side merge aborted for provider=%s, session=%s.', v_provider, p_session_id::text)),
    'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count,
    'found_count', 0,
    'missing_count', v_expected_count,
    'upserted', 0,
    'failed', 0,
    'duplicate_source_keys', v_duplicate_source_keys,
    'attempts', 1,
    'duration_ms', floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::bigint
  );
end;
$$;

grant execute on function public.merge_provider_pois_to_unified(text, text, uuid) to service_role;
