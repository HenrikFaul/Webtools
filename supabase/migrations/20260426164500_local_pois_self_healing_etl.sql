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
