create table if not exists public.osm_addresses (
  id bigint generated always as identity primary key,
  external_id text not null,
  osm_id bigint,
  osm_type text,
  display_name text,
  name text,
  country text,
  country_code text,
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
  lat double precision,
  lon double precision,
  geometry_type text,
  raw_tags jsonb not null default '{}'::jsonb,
  raw_feature jsonb not null default '{}'::jsonb,
  source_file text,
  import_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.osm_addresses add column if not exists external_id text;
alter table public.osm_addresses add column if not exists display_name text;
alter table public.osm_addresses add column if not exists municipality text;
alter table public.osm_addresses add column if not exists town text;
alter table public.osm_addresses add column if not exists village text;
alter table public.osm_addresses add column if not exists neighbourhood text;
alter table public.osm_addresses add column if not exists hamlet text;
alter table public.osm_addresses add column if not exists street_name text;
alter table public.osm_addresses add column if not exists street_type_normalized text;
alter table public.osm_addresses add column if not exists place text;
alter table public.osm_addresses add column if not exists house_number text;
alter table public.osm_addresses add column if not exists house_number_suffix text;
alter table public.osm_addresses add column if not exists staircase text;
alter table public.osm_addresses add column if not exists entrance text;
alter table public.osm_addresses add column if not exists block text;
alter table public.osm_addresses add column if not exists building text;
alter table public.osm_addresses add column if not exists flats text;
alter table public.osm_addresses add column if not exists conscriptionnumber text;
alter table public.osm_addresses add column if not exists interpolation text;
alter table public.osm_addresses add column if not exists geometry_type text;
alter table public.osm_addresses add column if not exists raw_tags jsonb not null default '{}'::jsonb;
alter table public.osm_addresses add column if not exists raw_feature jsonb not null default '{}'::jsonb;
alter table public.osm_addresses add column if not exists source_file text;
alter table public.osm_addresses add column if not exists import_session_id uuid;
alter table public.osm_addresses add column if not exists updated_at timestamptz not null default now();

update public.osm_addresses
set external_id = coalesce(external_id, osm_type || '/' || osm_id::text)
where external_id is null and osm_type is not null and osm_id is not null;

create unique index if not exists osm_addresses_external_id_key on public.osm_addresses(external_id);
create index if not exists idx_osm_addresses_country_code on public.osm_addresses(country_code);
create index if not exists idx_osm_addresses_city on public.osm_addresses(city);
create index if not exists idx_osm_addresses_postcode on public.osm_addresses(postcode);
create index if not exists idx_osm_addresses_street on public.osm_addresses(street);
create index if not exists idx_osm_addresses_housenumber on public.osm_addresses(housenumber);
create index if not exists idx_osm_addresses_raw_tags_gin on public.osm_addresses using gin(raw_tags);
