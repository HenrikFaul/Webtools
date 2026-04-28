-- AWS Location Service POI raw table (mirrors geoapify_pois / tomtom_pois pattern)
-- Additive-only migration: creates aws_pois if it does not already exist.

create extension if not exists pgcrypto;

create table if not exists public.aws_pois (
  id                uuid        primary key default gen_random_uuid(),
  external_id       text        not null,
  name              text,
  country_code      varchar(10),
  country           text,
  country_code_iso3 varchar(10),
  state_region      text,
  city              text,
  district          text,
  postal_code       text,
  street            text,
  street_number     text,
  formatted_address text,
  lat               double precision,
  lon               double precision,
  phone             text,
  email             text,
  website           text,
  categories        jsonb        not null default '[]'::jsonb,
  place_type        text,
  opening_hours     jsonb,
  raw_data          jsonb        not null default '{}'::jsonb,
  fetch_category    text,
  fetched_at        timestamptz  not null default now(),
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

-- Unique constraint on external_id (AWS PlaceId)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aws_pois_external_id_key'
      and conrelid = 'public.aws_pois'::regclass
  ) then
    alter table public.aws_pois add constraint aws_pois_external_id_key unique (external_id);
  end if;
end;
$$;

-- Useful indexes
create index if not exists aws_pois_country_code_idx  on public.aws_pois (country_code);
create index if not exists aws_pois_fetch_category_idx on public.aws_pois (fetch_category);
create index if not exists aws_pois_fetched_at_idx    on public.aws_pois (fetched_at);

-- Enable Row-Level Security (keep consistent with other POI tables)
alter table public.aws_pois enable row level security;

-- Service-role full access (mirrors existing pattern)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'aws_pois' and policyname = 'service_role_aws_pois'
  ) then
    create policy service_role_aws_pois on public.aws_pois
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;
