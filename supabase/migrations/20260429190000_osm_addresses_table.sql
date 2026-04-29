-- Full country address database imported from OpenStreetMap / Geofabrik extracts.
-- This table is intentionally separate from POI provider tables.

create extension if not exists pgcrypto;
create extension if not exists cube;
create extension if not exists earthdistance;

create table if not exists public.osm_addresses (
  id bigint generated always as identity primary key,

  -- Stable OSM identity
  external_id text generated always as (osm_type || ':' || osm_id::text) stored unique,
  osm_id bigint not null,
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),

  -- Display / hierarchy
  display_name text,
  name text,
  country text,
  country_code text not null,
  state text,
  county text,
  district text,
  municipality text,
  city text,
  town text,
  village text,
  suburb text,
  neighbourhood text,
  hamlet text,
  postcode text,

  -- Street-level address decomposition
  street text,
  street_name text,
  street_type text,
  street_type_normalized text,
  place text,
  housenumber text,
  house_number text,
  house_number_suffix text,
  unit text,
  floor text,
  door text,
  staircase text,
  entrance text,
  block text,
  building text,
  flats text,
  conscriptionnumber text,
  interpolation text,

  -- Coordinates. For ways/relations this is the geometry centroid emitted by osmium export.
  lat double precision,
  lon double precision,

  -- Geometry metadata and complete raw tags for lossless reload / later enrichment.
  geometry_type text,
  raw_tags jsonb not null default '{}'::jsonb,
  raw_feature jsonb not null default '{}'::jsonb,
  source_file text,
  import_session_id uuid not null default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists osm_addresses_country_code_idx on public.osm_addresses(country_code);
create index if not exists osm_addresses_postcode_idx on public.osm_addresses(postcode);
create index if not exists osm_addresses_city_idx on public.osm_addresses(city);
create index if not exists osm_addresses_street_idx on public.osm_addresses(street);
create index if not exists osm_addresses_housenumber_idx on public.osm_addresses(housenumber);
create index if not exists osm_addresses_raw_tags_gin_idx on public.osm_addresses using gin(raw_tags);
create index if not exists osm_addresses_lat_lon_earth_idx on public.osm_addresses using gist (ll_to_earth(lat, lon)) where lat is not null and lon is not null;

create or replace function public.set_osm_addresses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_osm_addresses_updated_at on public.osm_addresses;
create trigger trg_osm_addresses_updated_at
before update on public.osm_addresses
for each row execute function public.set_osm_addresses_updated_at();
