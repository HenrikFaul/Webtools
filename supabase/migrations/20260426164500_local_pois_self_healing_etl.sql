-- v4.1.5 POI ETL schema hardening + database-side provider merge.
-- Safe to run more than once in Supabase SQL Editor. v4.1.5 drops incompatible target defaults before type changes.
-- Goal: make unified_pois and local_pois use the same canonical datatypes,
-- then move raw provider data with explicit casts instead of fragile JS row loops.

create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ */
/*  Safe cast helpers                                                  */
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

create or replace function public.__poi_uuid_safe(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::uuid;
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
/*  Raw source table guardrails                                        */
/* ------------------------------------------------------------------ */

create table if not exists public.geoapify_pois (id uuid default gen_random_uuid(), external_id text);
create table if not exists public.tomtom_pois (id uuid default gen_random_uuid(), external_id text);

alter table public.geoapify_pois add column if not exists id uuid default gen_random_uuid();
alter table public.geoapify_pois add column if not exists external_id text;
alter table public.geoapify_pois add column if not exists name text;
alter table public.geoapify_pois add column if not exists country text;
alter table public.geoapify_pois add column if not exists country_code text;
alter table public.geoapify_pois add column if not exists state text;
alter table public.geoapify_pois add column if not exists city text;
alter table public.geoapify_pois add column if not exists postcode text;
alter table public.geoapify_pois add column if not exists district text;
alter table public.geoapify_pois add column if not exists suburb text;
alter table public.geoapify_pois add column if not exists street text;
alter table public.geoapify_pois add column if not exists housenumber text;
alter table public.geoapify_pois add column if not exists iso3166_2 text;
alter table public.geoapify_pois add column if not exists lat double precision;
alter table public.geoapify_pois add column if not exists lon double precision;
alter table public.geoapify_pois add column if not exists formatted_address text;
alter table public.geoapify_pois add column if not exists address_line1 text;
alter table public.geoapify_pois add column if not exists address_line2 text;
alter table public.geoapify_pois add column if not exists categories jsonb default '[]'::jsonb;
alter table public.geoapify_pois add column if not exists details jsonb default '[]'::jsonb;
alter table public.geoapify_pois add column if not exists website text;
alter table public.geoapify_pois add column if not exists opening_hours jsonb;
alter table public.geoapify_pois add column if not exists phone text;
alter table public.geoapify_pois add column if not exists email text;
alter table public.geoapify_pois add column if not exists facebook text;
alter table public.geoapify_pois add column if not exists instagram text;
alter table public.geoapify_pois add column if not exists tripadvisor text;
alter table public.geoapify_pois add column if not exists operator text;
alter table public.geoapify_pois add column if not exists brand text;
alter table public.geoapify_pois add column if not exists branch text;
alter table public.geoapify_pois add column if not exists cuisine text;
alter table public.geoapify_pois add column if not exists diet jsonb default '{}'::jsonb;
alter table public.geoapify_pois add column if not exists capacity integer;
alter table public.geoapify_pois add column if not exists reservation text;
alter table public.geoapify_pois add column if not exists wheelchair text;
alter table public.geoapify_pois add column if not exists outdoor_seating boolean;
alter table public.geoapify_pois add column if not exists indoor_seating boolean;
alter table public.geoapify_pois add column if not exists internet_access boolean;
alter table public.geoapify_pois add column if not exists air_conditioning boolean;
alter table public.geoapify_pois add column if not exists smoking text;
alter table public.geoapify_pois add column if not exists toilets text;
alter table public.geoapify_pois add column if not exists takeaway boolean;
alter table public.geoapify_pois add column if not exists delivery boolean;
alter table public.geoapify_pois add column if not exists payment_options jsonb default '{}'::jsonb;
alter table public.geoapify_pois add column if not exists name_international jsonb default '{}'::jsonb;
alter table public.geoapify_pois add column if not exists name_other jsonb default '{}'::jsonb;
alter table public.geoapify_pois add column if not exists datasource_name text;
alter table public.geoapify_pois add column if not exists osm_id bigint;
alter table public.geoapify_pois add column if not exists osm_type text;
alter table public.geoapify_pois add column if not exists building_type text;
alter table public.geoapify_pois add column if not exists raw_data jsonb;
alter table public.geoapify_pois add column if not exists fetch_category text;
alter table public.geoapify_pois add column if not exists fetched_at timestamptz default now();

alter table public.tomtom_pois add column if not exists id uuid default gen_random_uuid();
alter table public.tomtom_pois add column if not exists external_id text;
alter table public.tomtom_pois add column if not exists name text;
alter table public.tomtom_pois add column if not exists phone text;
alter table public.tomtom_pois add column if not exists url text;
alter table public.tomtom_pois add column if not exists categories jsonb default '[]'::jsonb;
alter table public.tomtom_pois add column if not exists category_set jsonb default '[]'::jsonb;
alter table public.tomtom_pois add column if not exists classifications jsonb default '[]'::jsonb;
alter table public.tomtom_pois add column if not exists opening_hours jsonb;
alter table public.tomtom_pois add column if not exists score double precision;
alter table public.tomtom_pois add column if not exists dist double precision;
alter table public.tomtom_pois add column if not exists info text;
alter table public.tomtom_pois add column if not exists street_number text;
alter table public.tomtom_pois add column if not exists street_name text;
alter table public.tomtom_pois add column if not exists municipality_subdivision text;
alter table public.tomtom_pois add column if not exists municipality text;
alter table public.tomtom_pois add column if not exists municipality_secondary_subdivision text;
alter table public.tomtom_pois add column if not exists country_subdivision text;
alter table public.tomtom_pois add column if not exists country_subdivision_name text;
alter table public.tomtom_pois add column if not exists country_subdivision_code text;
alter table public.tomtom_pois add column if not exists postal_code text;
alter table public.tomtom_pois add column if not exists country_code text;
alter table public.tomtom_pois add column if not exists country text;
alter table public.tomtom_pois add column if not exists country_code_iso3 text;
alter table public.tomtom_pois add column if not exists freeform_address text;
alter table public.tomtom_pois add column if not exists local_name text;
alter table public.tomtom_pois add column if not exists lat double precision;
alter table public.tomtom_pois add column if not exists lon double precision;
alter table public.tomtom_pois add column if not exists viewport_top_lat double precision;
alter table public.tomtom_pois add column if not exists viewport_top_lon double precision;
alter table public.tomtom_pois add column if not exists viewport_btm_lat double precision;
alter table public.tomtom_pois add column if not exists viewport_btm_lon double precision;
alter table public.tomtom_pois add column if not exists entry_points jsonb default '[]'::jsonb;
alter table public.tomtom_pois add column if not exists raw_data jsonb;
alter table public.tomtom_pois add column if not exists fetch_category text;
alter table public.tomtom_pois add column if not exists fetched_at timestamptz default now();

create index if not exists geoapify_pois_external_id_idx on public.geoapify_pois (external_id);
create index if not exists geoapify_pois_country_idx on public.geoapify_pois (country_code);
create index if not exists tomtom_pois_external_id_idx on public.tomtom_pois (external_id);
create index if not exists tomtom_pois_country_idx on public.tomtom_pois (country_code);

/* ------------------------------------------------------------------ */
/*  Canonical unified/local target tables                              */
/* ------------------------------------------------------------------ */

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
  unified_at timestamptz default now(),
  last_merge_session uuid,
  last_merged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

/* Add missing target columns first. */
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
alter table public.unified_pois add column if not exists opening_hours jsonb;
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

/* Drop audit views before changing target table column types. */
drop view if exists public.poi_etl_schema_audit;
drop view if exists public.poi_table_column_types;

/*
  PostgreSQL will not change a column type if its existing DEFAULT cannot be
  automatically cast to the new datatype. This is exactly what broke v4.1.4
  for categories: an older text default was still attached while the column was
  being converted to jsonb. Drop only defaults on columns whose type is about
  to be normalized; re-apply the canonical defaults below after conversion.
*/
do $$
declare
  r record;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('unified_pois', 'local_pois')
      and column_name in (
        'name_international','categories','lat','lon','opening_hours','diet','capacity',
        'outdoor_seating','indoor_seating','internet_access','air_conditioning',
        'takeaway','delivery','payment_options','osm_id','raw_data','source_fetched_at',
        'unified_at','source_unified_at','last_merge_session','last_merged_at',
        'last_load_session','last_loaded_at','created_at','updated_at'
      )
      and column_default is not null
  loop
    execute format('alter table public.%I alter column %I drop default', r.table_name, r.column_name);
  end loop;
end $$;

/* Normalize target column types. All text columns become unlimited text, so there is no hidden length cap. */
alter table public.unified_pois alter column source_provider type text using source_provider::text;
alter table public.unified_pois alter column source_id type text using source_id::text;
alter table public.unified_pois alter column name type text using name::text;
alter table public.unified_pois alter column name_international type jsonb using public.__poi_jsonb_or(name_international::text, '{}'::jsonb);
alter table public.unified_pois alter column categories type jsonb using public.__poi_jsonb_or(categories::text, '[]'::jsonb);
alter table public.unified_pois alter column country type text using country::text;
alter table public.unified_pois alter column country_code type text using country_code::text;
alter table public.unified_pois alter column country_code_iso3 type text using country_code_iso3::text;
alter table public.unified_pois alter column iso3166_2 type text using iso3166_2::text;
alter table public.unified_pois alter column state_region type text using state_region::text;
alter table public.unified_pois alter column city type text using city::text;
alter table public.unified_pois alter column district type text using district::text;
alter table public.unified_pois alter column suburb type text using suburb::text;
alter table public.unified_pois alter column postal_code type text using postal_code::text;
alter table public.unified_pois alter column street type text using street::text;
alter table public.unified_pois alter column street_number type text using street_number::text;
alter table public.unified_pois alter column formatted_address type text using formatted_address::text;
alter table public.unified_pois alter column address_line1 type text using address_line1::text;
alter table public.unified_pois alter column address_line2 type text using address_line2::text;
alter table public.unified_pois alter column lat type double precision using public.__poi_double_safe(lat::text);
alter table public.unified_pois alter column lon type double precision using public.__poi_double_safe(lon::text);
alter table public.unified_pois alter column phone type text using phone::text;
alter table public.unified_pois alter column email type text using email::text;
alter table public.unified_pois alter column website type text using website::text;
alter table public.unified_pois alter column facebook type text using facebook::text;
alter table public.unified_pois alter column instagram type text using instagram::text;
alter table public.unified_pois alter column tripadvisor type text using tripadvisor::text;
alter table public.unified_pois alter column opening_hours type jsonb using public.__poi_jsonb_or(opening_hours::text, null::jsonb);
alter table public.unified_pois alter column operator type text using operator::text;
alter table public.unified_pois alter column brand type text using brand::text;
alter table public.unified_pois alter column branch type text using branch::text;
alter table public.unified_pois alter column cuisine type text using cuisine::text;
alter table public.unified_pois alter column diet type jsonb using public.__poi_jsonb_or(diet::text, '{}'::jsonb);
alter table public.unified_pois alter column capacity type integer using public.__poi_int_safe(capacity::text);
alter table public.unified_pois alter column reservation type text using reservation::text;
alter table public.unified_pois alter column wheelchair type text using wheelchair::text;
alter table public.unified_pois alter column outdoor_seating type boolean using public.__poi_bool_safe(outdoor_seating::text);
alter table public.unified_pois alter column indoor_seating type boolean using public.__poi_bool_safe(indoor_seating::text);
alter table public.unified_pois alter column internet_access type boolean using public.__poi_bool_safe(internet_access::text);
alter table public.unified_pois alter column air_conditioning type boolean using public.__poi_bool_safe(air_conditioning::text);
alter table public.unified_pois alter column smoking type text using smoking::text;
alter table public.unified_pois alter column toilets type text using toilets::text;
alter table public.unified_pois alter column takeaway type boolean using public.__poi_bool_safe(takeaway::text);
alter table public.unified_pois alter column delivery type boolean using public.__poi_bool_safe(delivery::text);
alter table public.unified_pois alter column payment_options type jsonb using public.__poi_jsonb_or(payment_options::text, '{}'::jsonb);
alter table public.unified_pois alter column classification_code type text using classification_code::text;
alter table public.unified_pois alter column osm_id type bigint using public.__poi_bigint_safe(osm_id::text);
alter table public.unified_pois alter column building_type type text using building_type::text;
alter table public.unified_pois alter column raw_data type jsonb using public.__poi_jsonb_or(raw_data::text, '{}'::jsonb);
alter table public.unified_pois alter column source_fetched_at type timestamptz using public.__poi_timestamptz_safe(source_fetched_at::text);
alter table public.unified_pois alter column unified_at type timestamptz using coalesce(public.__poi_timestamptz_safe(unified_at::text), now());
alter table public.unified_pois alter column last_merge_session type uuid using public.__poi_uuid_safe(last_merge_session::text);
alter table public.unified_pois alter column last_merged_at type timestamptz using public.__poi_timestamptz_safe(last_merged_at::text);
alter table public.unified_pois alter column created_at type timestamptz using coalesce(public.__poi_timestamptz_safe(created_at::text), now());
alter table public.unified_pois alter column updated_at type timestamptz using coalesce(public.__poi_timestamptz_safe(updated_at::text), now());

alter table public.local_pois alter column provider_id type text using provider_id::text;
alter table public.local_pois alter column source_provider type text using source_provider::text;
alter table public.local_pois alter column name type text using name::text;
alter table public.local_pois alter column name_international type jsonb using public.__poi_jsonb_or(name_international::text, '{}'::jsonb);
alter table public.local_pois alter column categories type jsonb using public.__poi_jsonb_or(categories::text, '[]'::jsonb);
alter table public.local_pois alter column country type text using country::text;
alter table public.local_pois alter column country_code type text using country_code::text;
alter table public.local_pois alter column country_code_iso3 type text using country_code_iso3::text;
alter table public.local_pois alter column iso3166_2 type text using iso3166_2::text;
alter table public.local_pois alter column state_region type text using state_region::text;
alter table public.local_pois alter column city type text using city::text;
alter table public.local_pois alter column district type text using district::text;
alter table public.local_pois alter column suburb type text using suburb::text;
alter table public.local_pois alter column postal_code type text using postal_code::text;
alter table public.local_pois alter column street type text using street::text;
alter table public.local_pois alter column street_number type text using street_number::text;
alter table public.local_pois alter column formatted_address type text using formatted_address::text;
alter table public.local_pois alter column address_line1 type text using address_line1::text;
alter table public.local_pois alter column address_line2 type text using address_line2::text;
alter table public.local_pois alter column lat type double precision using public.__poi_double_safe(lat::text);
alter table public.local_pois alter column lon type double precision using public.__poi_double_safe(lon::text);
alter table public.local_pois alter column phone type text using phone::text;
alter table public.local_pois alter column email type text using email::text;
alter table public.local_pois alter column website type text using website::text;
alter table public.local_pois alter column facebook type text using facebook::text;
alter table public.local_pois alter column instagram type text using instagram::text;
alter table public.local_pois alter column tripadvisor type text using tripadvisor::text;
alter table public.local_pois alter column opening_hours type jsonb using public.__poi_jsonb_or(opening_hours::text, null::jsonb);
alter table public.local_pois alter column operator type text using operator::text;
alter table public.local_pois alter column brand type text using brand::text;
alter table public.local_pois alter column branch type text using branch::text;
alter table public.local_pois alter column cuisine type text using cuisine::text;
alter table public.local_pois alter column diet type jsonb using public.__poi_jsonb_or(diet::text, '{}'::jsonb);
alter table public.local_pois alter column capacity type integer using public.__poi_int_safe(capacity::text);
alter table public.local_pois alter column reservation type text using reservation::text;
alter table public.local_pois alter column wheelchair type text using wheelchair::text;
alter table public.local_pois alter column outdoor_seating type boolean using public.__poi_bool_safe(outdoor_seating::text);
alter table public.local_pois alter column indoor_seating type boolean using public.__poi_bool_safe(indoor_seating::text);
alter table public.local_pois alter column internet_access type boolean using public.__poi_bool_safe(internet_access::text);
alter table public.local_pois alter column air_conditioning type boolean using public.__poi_bool_safe(air_conditioning::text);
alter table public.local_pois alter column smoking type text using smoking::text;
alter table public.local_pois alter column toilets type text using toilets::text;
alter table public.local_pois alter column takeaway type boolean using public.__poi_bool_safe(takeaway::text);
alter table public.local_pois alter column delivery type boolean using public.__poi_bool_safe(delivery::text);
alter table public.local_pois alter column payment_options type jsonb using public.__poi_jsonb_or(payment_options::text, '{}'::jsonb);
alter table public.local_pois alter column classification_code type text using classification_code::text;
alter table public.local_pois alter column osm_id type bigint using public.__poi_bigint_safe(osm_id::text);
alter table public.local_pois alter column building_type type text using building_type::text;
alter table public.local_pois alter column raw_data type jsonb using public.__poi_jsonb_or(raw_data::text, '{}'::jsonb);
alter table public.local_pois alter column source_fetched_at type timestamptz using public.__poi_timestamptz_safe(source_fetched_at::text);
alter table public.local_pois alter column source_unified_at type timestamptz using public.__poi_timestamptz_safe(source_unified_at::text);
alter table public.local_pois alter column last_load_session type uuid using public.__poi_uuid_safe(last_load_session::text);
alter table public.local_pois alter column last_loaded_at type timestamptz using public.__poi_timestamptz_safe(last_loaded_at::text);
alter table public.local_pois alter column created_at type timestamptz using coalesce(public.__poi_timestamptz_safe(created_at::text), now());
alter table public.local_pois alter column updated_at type timestamptz using coalesce(public.__poi_timestamptz_safe(updated_at::text), now());

update public.unified_pois set source_provider = coalesce(nullif(source_provider, ''), 'unknown') where source_provider is null or source_provider = '';
update public.unified_pois set source_id = coalesce(nullif(source_id, ''), id::text) where source_id is null or source_id = '';
update public.local_pois set provider_id = coalesce(nullif(provider_id, ''), id::text) where provider_id is null or provider_id = '';
update public.local_pois set source_provider = coalesce(nullif(source_provider, ''), 'unknown') where source_provider is null or source_provider = '';

alter table public.unified_pois alter column source_provider set not null;
alter table public.unified_pois alter column source_id set not null;
alter table public.local_pois alter column provider_id set not null;
alter table public.local_pois alter column source_provider set not null;

alter table public.unified_pois alter column name_international set default '{}'::jsonb;
alter table public.unified_pois alter column categories set default '[]'::jsonb;
alter table public.unified_pois alter column diet set default '{}'::jsonb;
alter table public.unified_pois alter column payment_options set default '{}'::jsonb;
alter table public.unified_pois alter column unified_at set default now();
alter table public.unified_pois alter column created_at set default now();
alter table public.unified_pois alter column updated_at set default now();
alter table public.local_pois alter column name_international set default '{}'::jsonb;
alter table public.local_pois alter column categories set default '[]'::jsonb;
alter table public.local_pois alter column diet set default '{}'::jsonb;
alter table public.local_pois alter column payment_options set default '{}'::jsonb;
alter table public.local_pois alter column created_at set default now();
alter table public.local_pois alter column updated_at set default now();
alter table public.unified_pois alter column id set default gen_random_uuid();
alter table public.local_pois alter column id set default gen_random_uuid();

create index if not exists unified_pois_source_provider_source_id_idx on public.unified_pois (source_provider, source_id);
create index if not exists unified_pois_last_merge_session_idx on public.unified_pois (last_merge_session);
create index if not exists unified_pois_source_provider_country_idx on public.unified_pois (source_provider, country_code);
do $$
begin
  if exists (
    select 1
    from public.local_pois
    group by provider_id, source_provider
    having count(*) > 1
    limit 1
  ) then
    raise notice 'local_pois_provider_source_uidx was not created because duplicate provider_id/source_provider rows exist. Run duplicate cleanup before relying on ON CONFLICT local upsert.';
  else
    create unique index if not exists local_pois_provider_source_uidx on public.local_pois (provider_id, source_provider);
  end if;
end $$;
create index if not exists local_pois_last_load_session_idx on public.local_pois (last_load_session);
create index if not exists local_pois_source_provider_country_idx on public.local_pois (source_provider, country_code);

/* ------------------------------------------------------------------ */
/*  Audit views: run these after migration to see mismatches quickly.   */
/* ------------------------------------------------------------------ */

drop view if exists public.poi_etl_schema_audit;
create view public.poi_etl_schema_audit as
with expected(column_name, unified_column, local_column, expected_unified_type, expected_local_type) as (
  values
    ('source_key', 'source_id', 'provider_id', 'text', 'text'),
    ('source_provider', 'source_provider', 'source_provider', 'text', 'text'),
    ('name', 'name', 'name', 'text', 'text'),
    ('name_international', 'name_international', 'name_international', 'jsonb', 'jsonb'),
    ('categories', 'categories', 'categories', 'jsonb', 'jsonb'),
    ('country', 'country', 'country', 'text', 'text'),
    ('country_code', 'country_code', 'country_code', 'text', 'text'),
    ('country_code_iso3', 'country_code_iso3', 'country_code_iso3', 'text', 'text'),
    ('iso3166_2', 'iso3166_2', 'iso3166_2', 'text', 'text'),
    ('state_region', 'state_region', 'state_region', 'text', 'text'),
    ('city', 'city', 'city', 'text', 'text'),
    ('district', 'district', 'district', 'text', 'text'),
    ('suburb', 'suburb', 'suburb', 'text', 'text'),
    ('postal_code', 'postal_code', 'postal_code', 'text', 'text'),
    ('street', 'street', 'street', 'text', 'text'),
    ('street_number', 'street_number', 'street_number', 'text', 'text'),
    ('formatted_address', 'formatted_address', 'formatted_address', 'text', 'text'),
    ('address_line1', 'address_line1', 'address_line1', 'text', 'text'),
    ('address_line2', 'address_line2', 'address_line2', 'text', 'text'),
    ('lat', 'lat', 'lat', 'double precision', 'double precision'),
    ('lon', 'lon', 'lon', 'double precision', 'double precision'),
    ('phone', 'phone', 'phone', 'text', 'text'),
    ('email', 'email', 'email', 'text', 'text'),
    ('website', 'website', 'website', 'text', 'text'),
    ('facebook', 'facebook', 'facebook', 'text', 'text'),
    ('instagram', 'instagram', 'instagram', 'text', 'text'),
    ('tripadvisor', 'tripadvisor', 'tripadvisor', 'text', 'text'),
    ('opening_hours', 'opening_hours', 'opening_hours', 'jsonb', 'jsonb'),
    ('operator', 'operator', 'operator', 'text', 'text'),
    ('brand', 'brand', 'brand', 'text', 'text'),
    ('branch', 'branch', 'branch', 'text', 'text'),
    ('cuisine', 'cuisine', 'cuisine', 'text', 'text'),
    ('diet', 'diet', 'diet', 'jsonb', 'jsonb'),
    ('capacity', 'capacity', 'capacity', 'integer', 'integer'),
    ('reservation', 'reservation', 'reservation', 'text', 'text'),
    ('wheelchair', 'wheelchair', 'wheelchair', 'text', 'text'),
    ('outdoor_seating', 'outdoor_seating', 'outdoor_seating', 'boolean', 'boolean'),
    ('indoor_seating', 'indoor_seating', 'indoor_seating', 'boolean', 'boolean'),
    ('internet_access', 'internet_access', 'internet_access', 'boolean', 'boolean'),
    ('air_conditioning', 'air_conditioning', 'air_conditioning', 'boolean', 'boolean'),
    ('smoking', 'smoking', 'smoking', 'text', 'text'),
    ('toilets', 'toilets', 'toilets', 'text', 'text'),
    ('takeaway', 'takeaway', 'takeaway', 'boolean', 'boolean'),
    ('delivery', 'delivery', 'delivery', 'boolean', 'boolean'),
    ('payment_options', 'payment_options', 'payment_options', 'jsonb', 'jsonb'),
    ('classification_code', 'classification_code', 'classification_code', 'text', 'text'),
    ('osm_id', 'osm_id', 'osm_id', 'bigint', 'bigint'),
    ('building_type', 'building_type', 'building_type', 'text', 'text'),
    ('raw_data', 'raw_data', 'raw_data', 'jsonb', 'jsonb'),
    ('source_fetched_at', 'source_fetched_at', 'source_fetched_at', 'timestamp with time zone', 'timestamp with time zone'),
    ('unified_timestamp', 'unified_at', 'source_unified_at', 'timestamp with time zone', 'timestamp with time zone'),
    ('session_id', 'last_merge_session', 'last_load_session', 'uuid', 'uuid'),
    ('session_timestamp', 'last_merged_at', 'last_loaded_at', 'timestamp with time zone', 'timestamp with time zone'),
    ('created_at', 'created_at', 'created_at', 'timestamp with time zone', 'timestamp with time zone'),
    ('updated_at', 'updated_at', 'updated_at', 'timestamp with time zone', 'timestamp with time zone')
), cols as (
  select table_name, column_name, data_type, character_maximum_length
  from information_schema.columns
  where table_schema = 'public' and table_name in ('unified_pois','local_pois')
)
select
  e.column_name,
  e.unified_column,
  e.local_column,
  e.expected_unified_type,
  e.expected_local_type,
  u.data_type as unified_type,
  u.character_maximum_length as unified_length,
  l.data_type as local_type,
  l.character_maximum_length as local_length,
  coalesce(u.data_type, '') = e.expected_unified_type as unified_ok,
  coalesce(l.data_type, '') = e.expected_local_type as local_ok,
  coalesce(u.data_type, '') = coalesce(l.data_type, '') as same_datatype,
  coalesce(u.character_maximum_length, -1) = coalesce(l.character_maximum_length, -1) as same_length
from expected e
left join cols u on u.table_name = 'unified_pois' and u.column_name = e.unified_column
left join cols l on l.table_name = 'local_pois' and l.column_name = e.local_column
order by e.column_name;

drop view if exists public.poi_table_column_types;
create view public.poi_table_column_types as
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('geoapify_pois','tomtom_pois','unified_pois','local_pois')
order by table_name, ordinal_position;

/* ------------------------------------------------------------------ */
/*  Database-side raw provider -> unified_pois merge                   */
/* ------------------------------------------------------------------ */

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
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_country text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_raw_source_count integer := 0;
  v_expected_count integer := 0;
  v_duplicate_source_keys integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_found integer := 0;
  v_missing integer := 0;
  v_now timestamptz := now();
begin
  if v_provider not in ('geoapify', 'tomtom') then
    return jsonb_build_object(
      'status', 'FAILED', 'success', false, 'provider', p_provider, 'countryCode', v_country,
      'merge_session_id', p_session_id::text, 'raw_source_count', 0, 'expected_count', 0,
      'found_count', 0, 'missing_count', 0, 'inserted', 0, 'updated', 0, 'skipped', 0,
      'duplicate_source_keys', 0, 'errors', jsonb_build_array('provider must be geoapify or tomtom'),
      'merge_logs', jsonb_build_array()
    );
  end if;

  drop table if exists tmp_poi_source;

  create temporary table tmp_poi_source (
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
    select count(*)::integer,
           greatest(count(*)::integer - count(distinct external_id::text)::integer, 0)
      into v_raw_source_count, v_duplicate_source_keys
    from public.geoapify_pois
    where external_id is not null
      and (v_country is null or upper(country_code::text) = v_country);

    insert into tmp_poi_source
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
      and (v_country is null or upper(g.country_code::text) = v_country)
    order by g.external_id::text, public.__poi_timestamptz_safe(g.fetched_at::text) desc nulls last;
  else
    select count(*)::integer,
           greatest(count(*)::integer - count(distinct external_id::text)::integer, 0)
      into v_raw_source_count, v_duplicate_source_keys
    from public.tomtom_pois
    where external_id is not null
      and (v_country is null or upper(country_code::text) = v_country);

    insert into tmp_poi_source
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
      and (v_country is null or upper(t.country_code::text) = v_country)
    order by t.external_id::text, public.__poi_timestamptz_safe(t.fetched_at::text) desc nulls last;
  end if;

  select count(*)::integer into v_expected_count from tmp_poi_source;

  update public.unified_pois u
  set
    name = coalesce(s.name, u.name),
    name_international = coalesce(s.name_international, u.name_international, '{}'::jsonb),
    categories = coalesce(s.categories, u.categories, '[]'::jsonb),
    country = coalesce(s.country, u.country),
    country_code = coalesce(s.country_code, u.country_code),
    country_code_iso3 = coalesce(s.country_code_iso3, u.country_code_iso3),
    iso3166_2 = coalesce(s.iso3166_2, u.iso3166_2),
    state_region = coalesce(s.state_region, u.state_region),
    city = coalesce(s.city, u.city),
    district = coalesce(s.district, u.district),
    suburb = coalesce(s.suburb, u.suburb),
    postal_code = coalesce(s.postal_code, u.postal_code),
    street = coalesce(s.street, u.street),
    street_number = coalesce(s.street_number, u.street_number),
    formatted_address = coalesce(s.formatted_address, u.formatted_address),
    address_line1 = coalesce(s.address_line1, u.address_line1),
    address_line2 = coalesce(s.address_line2, u.address_line2),
    lat = coalesce(s.lat, u.lat),
    lon = coalesce(s.lon, u.lon),
    phone = coalesce(s.phone, u.phone),
    email = coalesce(s.email, u.email),
    website = coalesce(s.website, u.website),
    facebook = coalesce(s.facebook, u.facebook),
    instagram = coalesce(s.instagram, u.instagram),
    tripadvisor = coalesce(s.tripadvisor, u.tripadvisor),
    opening_hours = coalesce(s.opening_hours, u.opening_hours),
    operator = coalesce(s.operator, u.operator),
    brand = coalesce(s.brand, u.brand),
    branch = coalesce(s.branch, u.branch),
    cuisine = coalesce(s.cuisine, u.cuisine),
    diet = coalesce(s.diet, u.diet, '{}'::jsonb),
    capacity = coalesce(s.capacity, u.capacity),
    reservation = coalesce(s.reservation, u.reservation),
    wheelchair = coalesce(s.wheelchair, u.wheelchair),
    outdoor_seating = coalesce(s.outdoor_seating, u.outdoor_seating),
    indoor_seating = coalesce(s.indoor_seating, u.indoor_seating),
    internet_access = coalesce(s.internet_access, u.internet_access),
    air_conditioning = coalesce(s.air_conditioning, u.air_conditioning),
    smoking = coalesce(s.smoking, u.smoking),
    toilets = coalesce(s.toilets, u.toilets),
    takeaway = coalesce(s.takeaway, u.takeaway),
    delivery = coalesce(s.delivery, u.delivery),
    payment_options = coalesce(s.payment_options, u.payment_options, '{}'::jsonb),
    classification_code = coalesce(s.classification_code, u.classification_code),
    osm_id = coalesce(s.osm_id, u.osm_id),
    building_type = coalesce(s.building_type, u.building_type),
    raw_data = coalesce(s.raw_data, u.raw_data),
    source_fetched_at = coalesce(s.source_fetched_at, u.source_fetched_at),
    unified_at = coalesce(u.unified_at, v_now),
    last_merge_session = p_session_id,
    last_merged_at = v_now,
    updated_at = v_now
  from tmp_poi_source s
  where u.source_provider = s.source_provider
    and u.source_id = s.source_id;
  get diagnostics v_updated = row_count;

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
    s.source_provider, s.source_id, s.name, s.name_international, s.categories, s.country, s.country_code,
    s.country_code_iso3, s.iso3166_2, s.state_region, s.city, s.district, s.suburb, s.postal_code, s.street,
    s.street_number, s.formatted_address, s.address_line1, s.address_line2, s.lat, s.lon, s.phone, s.email,
    s.website, s.facebook, s.instagram, s.tripadvisor, s.opening_hours, s.operator, s.brand, s.branch, s.cuisine,
    s.diet, s.capacity, s.reservation, s.wheelchair, s.outdoor_seating, s.indoor_seating, s.internet_access,
    s.air_conditioning, s.smoking, s.toilets, s.takeaway, s.delivery, s.payment_options, s.classification_code,
    s.osm_id, s.building_type, s.raw_data, s.source_fetched_at, v_now, p_session_id,
    v_now, v_now, v_now
  from tmp_poi_source s
  where not exists (
    select 1 from public.unified_pois u
    where u.source_provider = s.source_provider and u.source_id = s.source_id
  );
  get diagnostics v_inserted = row_count;

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
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', greatest(v_raw_source_count - v_expected_count, 0),
    'duplicate_source_keys', v_duplicate_source_keys,
    'errors', case when v_missing = 0 then '[]'::jsonb else jsonb_build_array('Post-merge validation failed: expected ' || v_expected_count || ', found ' || v_found || ', missing ' || v_missing) end,
    'merge_logs', jsonb_build_array(
      'Session ' || p_session_id::text || ' started for provider=' || v_provider || coalesce(', country=' || v_country, ', country=ALL'),
      'Raw source rows: ' || v_raw_source_count,
      'Expected distinct source_id rows: ' || v_expected_count,
      'Updated rows: ' || v_updated,
      'Inserted rows: ' || v_inserted,
      'Found rows by last_merge_session: ' || v_found,
      'Missing rows: ' || v_missing
    )
  );
exception when others then
  return jsonb_build_object(
    'status', 'FAILED', 'success', false, 'provider', v_provider, 'countryCode', v_country,
    'merge_session_id', p_session_id::text, 'raw_source_count', v_raw_source_count,
    'expected_count', v_expected_count, 'found_count', v_found, 'missing_count', v_missing,
    'inserted', v_inserted, 'updated', v_updated, 'skipped', 0,
    'duplicate_source_keys', v_duplicate_source_keys,
    'errors', jsonb_build_array('Database-side merge failed: ' || sqlerrm),
    'merge_logs', jsonb_build_array('FAILED in merge_provider_pois_to_unified: ' || sqlerrm)
  );
end;
$$;

comment on function public.merge_provider_pois_to_unified(text, text, uuid) is
  'Set-based raw provider -> unified_pois merge. Uses canonical target datatypes and explicit safe casts; returns JSON status with exact session validation.';
comment on view public.poi_etl_schema_audit is
  'Shows canonical unified_pois/local_pois datatype and length alignment. All text fields should have NULL length, meaning unlimited text.';
comment on view public.poi_table_column_types is
  'Raw column inventory for geoapify_pois, tomtom_pois, unified_pois and local_pois.';
