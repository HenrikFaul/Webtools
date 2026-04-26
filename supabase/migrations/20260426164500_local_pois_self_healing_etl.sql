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
-- v4.1.3 POI provider -> unified_pois database-side merge hotfix.
-- Safe to run repeatedly. No data deletion. No aggressive deduplication.

create extension if not exists pgcrypto;

create table if not exists public.unified_pois (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null,
  source_id text not null,
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
  opening_hours text,
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
  unified_at timestamptz default now(),
  last_merge_session uuid,
  last_merged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.unified_pois add column if not exists id uuid default gen_random_uuid();
alter table public.unified_pois add column if not exists source_provider text;
alter table public.unified_pois add column if not exists source_id text;
alter table public.unified_pois add column if not exists name text;
alter table public.unified_pois add column if not exists name_international jsonb default '{}'::jsonb;
alter table public.unified_pois add column if not exists categories jsonb default '[]'::jsonb;
alter table public.unified_pois add column if not exists country text;
alter table public.unified_pois add column if not exists country_code text;
alter table public.unified_pois add column if not exists country_code_iso3 text;
alter table public.unified_pois add column if not exists iso3166_2 text;
alter table public.unified_pois add column if not exists state_region text;
alter table public.unified_pois add column if not exists city text;
alter table public.unified_pois add column if not exists district text;
alter table public.unified_pois add column if not exists suburb text;
alter table public.unified_pois add column if not exists postal_code text;
alter table public.unified_pois add column if not exists street text;
alter table public.unified_pois add column if not exists street_number text;
alter table public.unified_pois add column if not exists formatted_address text;
alter table public.unified_pois add column if not exists address_line1 text;
alter table public.unified_pois add column if not exists address_line2 text;
alter table public.unified_pois add column if not exists lat double precision;
alter table public.unified_pois add column if not exists lon double precision;
alter table public.unified_pois add column if not exists phone text;
alter table public.unified_pois add column if not exists email text;
alter table public.unified_pois add column if not exists website text;
alter table public.unified_pois add column if not exists facebook text;
alter table public.unified_pois add column if not exists instagram text;
alter table public.unified_pois add column if not exists tripadvisor text;
alter table public.unified_pois add column if not exists opening_hours text;
alter table public.unified_pois add column if not exists operator text;
alter table public.unified_pois add column if not exists brand text;
alter table public.unified_pois add column if not exists branch text;
alter table public.unified_pois add column if not exists cuisine text;
alter table public.unified_pois add column if not exists diet jsonb default '{}'::jsonb;
alter table public.unified_pois add column if not exists capacity integer;
alter table public.unified_pois add column if not exists reservation text;
alter table public.unified_pois add column if not exists wheelchair text;
alter table public.unified_pois add column if not exists outdoor_seating boolean;
alter table public.unified_pois add column if not exists indoor_seating boolean;
alter table public.unified_pois add column if not exists internet_access boolean;
alter table public.unified_pois add column if not exists air_conditioning boolean;
alter table public.unified_pois add column if not exists smoking text;
alter table public.unified_pois add column if not exists toilets text;
alter table public.unified_pois add column if not exists takeaway boolean;
alter table public.unified_pois add column if not exists delivery boolean;
alter table public.unified_pois add column if not exists payment_options jsonb default '{}'::jsonb;
alter table public.unified_pois add column if not exists classification_code text;
alter table public.unified_pois add column if not exists osm_id bigint;
alter table public.unified_pois add column if not exists building_type text;
alter table public.unified_pois add column if not exists raw_data jsonb;
alter table public.unified_pois add column if not exists source_fetched_at timestamptz;
alter table public.unified_pois add column if not exists unified_at timestamptz default now();
alter table public.unified_pois add column if not exists last_merge_session uuid;
alter table public.unified_pois add column if not exists last_merged_at timestamptz;
alter table public.unified_pois add column if not exists created_at timestamptz not null default now();
alter table public.unified_pois add column if not exists updated_at timestamptz not null default now();

create index if not exists unified_pois_source_provider_source_id_idx on public.unified_pois (source_provider, source_id);
create index if not exists unified_pois_last_merge_session_idx on public.unified_pois (last_merge_session);
create index if not exists unified_pois_source_provider_country_idx on public.unified_pois (source_provider, country_code);

create table if not exists public.poi_etl_errors (
  id uuid primary key default gen_random_uuid(),
  etl_stage text not null,
  provider text,
  source_id text,
  load_session uuid,
  error_message text not null,
  row_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.merge_provider_pois_to_unified(
  p_provider text,
  p_country_code text default null,
  p_session uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(trim(p_provider));
  v_country text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_raw_count integer := 0;
  v_expected_count integer := 0;
  v_updated integer := 0;
  v_inserted integer := 0;
  v_found integer := 0;
  v_missing integer := 0;
  v_started timestamptz := clock_timestamp();
begin
  if v_provider not in ('geoapify', 'tomtom') then
    raise exception 'Unsupported provider: %', p_provider;
  end if;

  if v_provider = 'geoapify' then
    select count(*), count(distinct external_id)
      into v_raw_count, v_expected_count
    from public.geoapify_pois
    where external_id is not null
      and (v_country is null or upper(country_code) = v_country);

    with src as (
      select distinct on (external_id)
        external_id::text as source_id,
        name::text as name,
        coalesce(name_international, '{}'::jsonb) as name_international,
        coalesce(categories, '[]'::jsonb) as categories,
        country::text as country,
        upper(country_code)::text as country_code,
        null::text as country_code_iso3,
        iso3166_2::text as iso3166_2,
        state::text as state_region,
        city::text as city,
        district::text as district,
        suburb::text as suburb,
        postcode::text as postal_code,
        street::text as street,
        housenumber::text as street_number,
        formatted_address::text as formatted_address,
        address_line1::text as address_line1,
        address_line2::text as address_line2,
        lat::double precision as lat,
        lon::double precision as lon,
        phone::text as phone,
        email::text as email,
        website::text as website,
        facebook::text as facebook,
        instagram::text as instagram,
        tripadvisor::text as tripadvisor,
        opening_hours::text as opening_hours,
        operator::text as operator,
        brand::text as brand,
        branch::text as branch,
        cuisine::text as cuisine,
        coalesce(diet, '{}'::jsonb) as diet,
        capacity::integer as capacity,
        reservation::text as reservation,
        wheelchair::text as wheelchair,
        outdoor_seating::boolean as outdoor_seating,
        indoor_seating::boolean as indoor_seating,
        internet_access::boolean as internet_access,
        air_conditioning::boolean as air_conditioning,
        smoking::text as smoking,
        toilets::text as toilets,
        takeaway::boolean as takeaway,
        delivery::boolean as delivery,
        coalesce(payment_options, '{}'::jsonb) as payment_options,
        null::text as classification_code,
        osm_id::bigint as osm_id,
        building_type::text as building_type,
        coalesce(raw_data, '{}'::jsonb) as raw_data,
        fetched_at::timestamptz as source_fetched_at
      from public.geoapify_pois
      where external_id is not null
        and (v_country is null or upper(country_code) = v_country)
      order by external_id, fetched_at desc nulls last
    ), upd as (
      update public.unified_pois u
      set name = s.name,
          name_international = s.name_international,
          categories = s.categories,
          country = s.country,
          country_code = s.country_code,
          country_code_iso3 = s.country_code_iso3,
          iso3166_2 = s.iso3166_2,
          state_region = s.state_region,
          city = s.city,
          district = s.district,
          suburb = s.suburb,
          postal_code = s.postal_code,
          street = s.street,
          street_number = s.street_number,
          formatted_address = s.formatted_address,
          address_line1 = s.address_line1,
          address_line2 = s.address_line2,
          lat = s.lat,
          lon = s.lon,
          phone = s.phone,
          email = s.email,
          website = s.website,
          facebook = s.facebook,
          instagram = s.instagram,
          tripadvisor = s.tripadvisor,
          opening_hours = s.opening_hours,
          operator = s.operator,
          brand = s.brand,
          branch = s.branch,
          cuisine = s.cuisine,
          diet = s.diet,
          capacity = s.capacity,
          reservation = s.reservation,
          wheelchair = s.wheelchair,
          outdoor_seating = s.outdoor_seating,
          indoor_seating = s.indoor_seating,
          internet_access = s.internet_access,
          air_conditioning = s.air_conditioning,
          smoking = s.smoking,
          toilets = s.toilets,
          takeaway = s.takeaway,
          delivery = s.delivery,
          payment_options = s.payment_options,
          classification_code = s.classification_code,
          osm_id = s.osm_id,
          building_type = s.building_type,
          raw_data = s.raw_data,
          source_fetched_at = s.source_fetched_at,
          unified_at = now(),
          last_merge_session = p_session,
          last_merged_at = now(),
          updated_at = now()
      from src s
      where u.source_provider = 'geoapify' and u.source_id = s.source_id
      returning u.id
    ), ins as (
      insert into public.unified_pois (
        source_provider, source_id, name, name_international, categories, country, country_code, country_code_iso3,
        iso3166_2, state_region, city, district, suburb, postal_code, street, street_number, formatted_address,
        address_line1, address_line2, lat, lon, phone, email, website, facebook, instagram, tripadvisor,
        opening_hours, operator, brand, branch, cuisine, diet, capacity, reservation, wheelchair, outdoor_seating,
        indoor_seating, internet_access, air_conditioning, smoking, toilets, takeaway, delivery, payment_options,
        classification_code, osm_id, building_type, raw_data, source_fetched_at, unified_at, last_merge_session,
        last_merged_at, created_at, updated_at
      )
      select 'geoapify', s.source_id, s.name, s.name_international, s.categories, s.country, s.country_code, s.country_code_iso3,
        s.iso3166_2, s.state_region, s.city, s.district, s.suburb, s.postal_code, s.street, s.street_number, s.formatted_address,
        s.address_line1, s.address_line2, s.lat, s.lon, s.phone, s.email, s.website, s.facebook, s.instagram, s.tripadvisor,
        s.opening_hours, s.operator, s.brand, s.branch, s.cuisine, s.diet, s.capacity, s.reservation, s.wheelchair, s.outdoor_seating,
        s.indoor_seating, s.internet_access, s.air_conditioning, s.smoking, s.toilets, s.takeaway, s.delivery, s.payment_options,
        s.classification_code, s.osm_id, s.building_type, s.raw_data, s.source_fetched_at, now(), p_session, now(), now(), now()
      from src s
      where not exists (
        select 1 from public.unified_pois u where u.source_provider = 'geoapify' and u.source_id = s.source_id
      )
      returning id
    )
    select (select count(*) from upd), (select count(*) from ins)
      into v_updated, v_inserted;
  else
    select count(*), count(distinct external_id)
      into v_raw_count, v_expected_count
    from public.tomtom_pois
    where external_id is not null
      and (v_country is null or upper(country_code) = v_country);

    with src as (
      select distinct on (external_id)
        external_id::text as source_id,
        name::text as name,
        '{}'::jsonb as name_international,
        coalesce(categories, '[]'::jsonb) as categories,
        country::text as country,
        upper(country_code)::text as country_code,
        country_code_iso3::text as country_code_iso3,
        null::text as iso3166_2,
        coalesce(country_subdivision_name, country_subdivision)::text as state_region,
        municipality::text as city,
        municipality_subdivision::text as district,
        municipality_secondary_subdivision::text as suburb,
        postal_code::text as postal_code,
        street_name::text as street,
        street_number::text as street_number,
        freeform_address::text as formatted_address,
        name::text as address_line1,
        freeform_address::text as address_line2,
        lat::double precision as lat,
        lon::double precision as lon,
        phone::text as phone,
        null::text as email,
        url::text as website,
        null::text as facebook,
        null::text as instagram,
        null::text as tripadvisor,
        opening_hours::text as opening_hours,
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
        null::text as classification_code,
        null::bigint as osm_id,
        null::text as building_type,
        coalesce(raw_data, '{}'::jsonb) as raw_data,
        fetched_at::timestamptz as source_fetched_at
      from public.tomtom_pois
      where external_id is not null
        and (v_country is null or upper(country_code) = v_country)
      order by external_id, fetched_at desc nulls last
    ), upd as (
      update public.unified_pois u
      set name = s.name,
          name_international = s.name_international,
          categories = s.categories,
          country = s.country,
          country_code = s.country_code,
          country_code_iso3 = s.country_code_iso3,
          iso3166_2 = s.iso3166_2,
          state_region = s.state_region,
          city = s.city,
          district = s.district,
          suburb = s.suburb,
          postal_code = s.postal_code,
          street = s.street,
          street_number = s.street_number,
          formatted_address = s.formatted_address,
          address_line1 = s.address_line1,
          address_line2 = s.address_line2,
          lat = s.lat,
          lon = s.lon,
          phone = s.phone,
          email = s.email,
          website = s.website,
          facebook = s.facebook,
          instagram = s.instagram,
          tripadvisor = s.tripadvisor,
          opening_hours = s.opening_hours,
          operator = s.operator,
          brand = s.brand,
          branch = s.branch,
          cuisine = s.cuisine,
          diet = s.diet,
          capacity = s.capacity,
          reservation = s.reservation,
          wheelchair = s.wheelchair,
          outdoor_seating = s.outdoor_seating,
          indoor_seating = s.indoor_seating,
          internet_access = s.internet_access,
          air_conditioning = s.air_conditioning,
          smoking = s.smoking,
          toilets = s.toilets,
          takeaway = s.takeaway,
          delivery = s.delivery,
          payment_options = s.payment_options,
          classification_code = s.classification_code,
          osm_id = s.osm_id,
          building_type = s.building_type,
          raw_data = s.raw_data,
          source_fetched_at = s.source_fetched_at,
          unified_at = now(),
          last_merge_session = p_session,
          last_merged_at = now(),
          updated_at = now()
      from src s
      where u.source_provider = 'tomtom' and u.source_id = s.source_id
      returning u.id
    ), ins as (
      insert into public.unified_pois (
        source_provider, source_id, name, name_international, categories, country, country_code, country_code_iso3,
        iso3166_2, state_region, city, district, suburb, postal_code, street, street_number, formatted_address,
        address_line1, address_line2, lat, lon, phone, email, website, facebook, instagram, tripadvisor,
        opening_hours, operator, brand, branch, cuisine, diet, capacity, reservation, wheelchair, outdoor_seating,
        indoor_seating, internet_access, air_conditioning, smoking, toilets, takeaway, delivery, payment_options,
        classification_code, osm_id, building_type, raw_data, source_fetched_at, unified_at, last_merge_session,
        last_merged_at, created_at, updated_at
      )
      select 'tomtom', s.source_id, s.name, s.name_international, s.categories, s.country, s.country_code, s.country_code_iso3,
        s.iso3166_2, s.state_region, s.city, s.district, s.suburb, s.postal_code, s.street, s.street_number, s.formatted_address,
        s.address_line1, s.address_line2, s.lat, s.lon, s.phone, s.email, s.website, s.facebook, s.instagram, s.tripadvisor,
        s.opening_hours, s.operator, s.brand, s.branch, s.cuisine, s.diet, s.capacity, s.reservation, s.wheelchair, s.outdoor_seating,
        s.indoor_seating, s.internet_access, s.air_conditioning, s.smoking, s.toilets, s.takeaway, s.delivery, s.payment_options,
        s.classification_code, s.osm_id, s.building_type, s.raw_data, s.source_fetched_at, now(), p_session, now(), now(), now()
      from src s
      where not exists (
        select 1 from public.unified_pois u where u.source_provider = 'tomtom' and u.source_id = s.source_id
      )
      returning id
    )
    select (select count(*) from upd), (select count(*) from ins)
      into v_updated, v_inserted;
  end if;

  select count(distinct source_id)
    into v_found
  from public.unified_pois
  where source_provider = v_provider
    and last_merge_session = p_session
    and (v_country is null or upper(country_code) = v_country);

  v_missing := greatest(v_expected_count - v_found, 0);

  return jsonb_build_object(
    'status', case when v_found = v_expected_count then 'SUCCESS' else 'FAILED' end,
    'success', v_found = v_expected_count,
    'provider', v_provider,
    'countryCode', v_country,
    'merge_session_id', p_session::text,
    'raw_source_count', v_raw_count,
    'expected_count', v_expected_count,
    'found_count', v_found,
    'missing_count', v_missing,
    'inserted', coalesce(v_inserted, 0),
    'updated', coalesce(v_updated, 0),
    'skipped', v_missing,
    'errors', case when v_found = v_expected_count then '[]'::jsonb else jsonb_build_array('Target count does not match source distinct count') end,
    'logs', jsonb_build_array(
      'Database-side merge started for provider=' || v_provider || coalesce(', country=' || v_country, ', country=ALL'),
      'Raw source rows: ' || v_raw_count,
      'Expected distinct source IDs: ' || v_expected_count,
      'Inserted rows: ' || coalesce(v_inserted, 0),
      'Updated rows: ' || coalesce(v_updated, 0),
      'Found target rows for session: ' || v_found,
      'Missing rows: ' || v_missing
    ),
    'duration_ms', floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
  );
exception when others then
  insert into public.poi_etl_errors(etl_stage, provider, load_session, error_message, row_data)
  values ('provider_to_unified_merge', v_provider, p_session, sqlerrm, jsonb_build_object('countryCode', v_country));
  return jsonb_build_object(
    'status', 'FAILED',
    'success', false,
    'provider', v_provider,
    'countryCode', v_country,
    'merge_session_id', p_session::text,
    'raw_source_count', 0,
    'expected_count', 0,
    'found_count', 0,
    'missing_count', 0,
    'inserted', 0,
    'updated', 0,
    'skipped', 0,
    'errors', jsonb_build_array(sqlerrm),
    'logs', jsonb_build_array('Database-side merge failed: ' || sqlerrm),
    'duration_ms', floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
  );
end;
$$;

grant execute on function public.merge_provider_pois_to_unified(text, text, uuid) to service_role;
