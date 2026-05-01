-- News Scout: source channel registry + scan log + run tracking + config
-- Apply in Supabase SQL Editor (geodata project)
-- Idempotent: safe to re-run

create extension if not exists pgcrypto;

-- ── Enum: source type ──────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'news_source_type') then
    create type public.news_source_type as enum (
      'municipality',
      'police',
      'healthcare',
      'utility',
      'gazette_legal',
      'eu_funding',
      'local_news',
      'regional_news',
      'authority',
      'transport',
      'disaster_management',
      'education_public',
      'other_public_interest'
    );
  end if;
end$$;

-- ── Enum: scan status ──────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'news_scan_status') then
    create type public.news_scan_status as enum (
      'ok',
      'no_match',
      'error',
      'skipped'
    );
  end if;
end$$;

-- ── URL normalizer ─────────────────────────────────────────────────────────
-- Strips scheme, www, trailing slashes and query/fragment so that
-- http://www.Example.com/hirek/ and https://example.com/hirek map to the same key.
create or replace function public.normalize_url_for_channel(input_url text)
returns text
language sql
immutable strict
as $$
  select 'https://' ||
    -- 3. remove trailing slashes
    rtrim(
      -- 2. remove scheme + optional www
      regexp_replace(
        -- 1. lowercase, strip fragment then query
        lower(
          split_part(
            split_part(btrim(input_url), '#', 1),
            '?', 1
          )
        ),
        '^https?://(www\.)?', ''
      ),
      '/'
    )
$$;

-- ── updated_at trigger ─────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── news_scan_runs ─────────────────────────────────────────────────────────
create table if not exists public.news_scan_runs (
  run_id                      uuid        primary key default gen_random_uuid(),
  started_at                  timestamptz not null default now(),
  finished_at                 timestamptz,
  scope_description           text,
  total_locations             integer     not null default 0,
  total_known_sources_checked integer     not null default 0,
  total_new_sources_found     integer     not null default 0,
  total_sources_with_matches  integer     not null default 0,
  status                      text        not null default 'queued',
  trigger_type                text        not null default 'manual',
  notes                       text,
  created_at                  timestamptz not null default now()
);

create index if not exists idx_news_scan_runs_started_at
  on public.news_scan_runs (started_at desc);
create index if not exists idx_news_scan_runs_status
  on public.news_scan_runs (status);

-- ── news_source_channels ───────────────────────────────────────────────────
create table if not exists public.news_source_channels (
  id                        uuid         primary key default gen_random_uuid(),
  county_name               text,
  city                      text         not null,
  postcode                  text         not null,
  normalized_city           text,
  source_name               text,
  source_type               public.news_source_type not null,
  source_base_url           text         not null,
  canonical_source_base_url text         not null,
  source_search_url         text,
  categories_supported      jsonb        not null default '[]'::jsonb,
  discovery_method          text,
  first_seen_at             timestamptz  not null default now(),
  last_seen_at              timestamptz  not null default now(),
  last_match_at             timestamptz,
  active                    boolean      not null default true,
  confidence_score          numeric(4,3) not null default 0.500
    constraint news_source_channels_confidence_chk check (confidence_score between 0 and 1),
  notes                     text,
  metadata                  jsonb        not null default '{}'::jsonb,
  created_at                timestamptz  not null default now(),
  updated_at                timestamptz  not null default now(),
  constraint news_source_channels_categories_is_array_chk
    check (jsonb_typeof(categories_supported) = 'array'),
  constraint news_source_channels_metadata_is_object_chk
    check (jsonb_typeof(metadata) = 'object'),
  -- Plain-column unique constraint – supported in CREATE TABLE
  constraint news_source_channels_unique_channel
    unique (city, postcode, canonical_source_base_url)
);

drop trigger if exists trg_news_source_channels_updated_at on public.news_source_channels;
create trigger trg_news_source_channels_updated_at
  before update on public.news_source_channels
  for each row execute function public.set_updated_at();

create index if not exists idx_news_source_channels_city_postcode
  on public.news_source_channels (city, postcode);
create index if not exists idx_news_source_channels_county
  on public.news_source_channels (county_name, city, postcode);
create index if not exists idx_news_source_channels_active
  on public.news_source_channels (active);
create index if not exists idx_news_source_channels_source_type
  on public.news_source_channels (source_type);
create index if not exists idx_news_source_channels_canonical_url
  on public.news_source_channels (canonical_source_base_url);
create index if not exists idx_news_source_channels_categories_gin
  on public.news_source_channels using gin (categories_supported);

-- ── news_source_scan_log ───────────────────────────────────────────────────
create table if not exists public.news_source_scan_log (
  id                        uuid         primary key default gen_random_uuid(),
  run_id                    uuid         not null
    references public.news_scan_runs (run_id) on delete cascade,
  scanned_at                timestamptz  not null default now(),
  county_name               text,
  city                      text         not null,
  postcode                  text         not null,
  source_channel_id         uuid
    references public.news_source_channels (id) on delete set null,
  source_base_url           text         not null,
  canonical_source_base_url text,
  checked_for_last_30_days  boolean      not null default true,
  had_match                 boolean      not null default false,
  matched_categories        jsonb        not null default '[]'::jsonb,
  match_count_estimate      integer,
  best_evidence_url         text,
  confidence_score          numeric(4,3) not null default 0.500
    constraint news_source_scan_log_confidence_chk check (confidence_score between 0 and 1),
  status                    public.news_scan_status not null default 'ok',
  error_message             text,
  metadata                  jsonb        not null default '{}'::jsonb,
  created_at                timestamptz  not null default now(),
  constraint news_source_scan_log_categories_is_array_chk
    check (jsonb_typeof(matched_categories) = 'array'),
  constraint news_source_scan_log_metadata_is_object_chk
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_news_source_scan_log_run_id
  on public.news_source_scan_log (run_id);
create index if not exists idx_news_source_scan_log_city_postcode
  on public.news_source_scan_log (city, postcode);
create index if not exists idx_news_source_scan_log_scanned_at
  on public.news_source_scan_log (scanned_at desc);
create index if not exists idx_news_source_scan_log_had_match
  on public.news_source_scan_log (had_match);
create index if not exists idx_news_source_scan_log_status
  on public.news_source_scan_log (status);

-- ── location_registry ──────────────────────────────────────────────────────
create table if not exists public.location_registry (
  id               uuid        primary key default gen_random_uuid(),
  county_name      text,
  city             text        not null,
  postcode         text        not null,
  normalized_city  text,
  -- district_variant can be NULL; NULLs are never equal in UNIQUE constraints,
  -- so a plain UNIQUE on (city, postcode, district_variant) would allow duplicate
  -- (city, postcode, NULL) rows.  Use a unique index with coalesce instead.
  district_variant text,
  search_aliases   jsonb       not null default '[]'::jsonb,
  metadata         jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint location_registry_aliases_is_array_chk
    check (jsonb_typeof(search_aliases) = 'array'),
  constraint location_registry_metadata_is_object_chk
    check (jsonb_typeof(metadata) = 'object')
  -- NOTE: the unique constraint on (city, postcode, district_variant)
  -- is enforced by the expression index below, NOT here, because
  -- PostgreSQL does not support expressions inside CREATE TABLE UNIQUE clauses.
);

-- Expression-based unique index: treats NULL district_variant as empty string
-- so that (city, postcode, NULL) is considered a duplicate of itself.
create unique index if not exists idx_location_registry_unique
  on public.location_registry (city, postcode, coalesce(district_variant, ''));

drop trigger if exists trg_location_registry_updated_at on public.location_registry;
create trigger trg_location_registry_updated_at
  before update on public.location_registry
  for each row execute function public.set_updated_at();

create index if not exists idx_location_registry_city_postcode
  on public.location_registry (city, postcode);

-- ── news_scout_config ──────────────────────────────────────────────────────
create table if not exists public.news_scout_config (
  id               uuid        primary key default gen_random_uuid(),
  schedule_enabled boolean     not null default false,
  schedule_type    text        not null default 'hours'
    constraint news_scout_config_schedule_type_chk
      check (schedule_type in ('minutes', 'hours', 'days')),
  schedule_value   integer     not null default 6,
  search_engines   jsonb       not null default '["google","bing"]'::jsonb,
  lookback_days    integer     not null default 30
    constraint news_scout_config_lookback_chk check (lookback_days between 1 and 365),
  webhook_url      text,
  notes            text,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

drop trigger if exists trg_news_scout_config_updated_at on public.news_scout_config;
create trigger trg_news_scout_config_updated_at
  before update on public.news_scout_config
  for each row execute function public.set_updated_at();

-- Insert the default config row only when the table is empty.
-- (ON CONFLICT DO NOTHING needs a conflict target / unique constraint;
--  since config has no unique column we use WHERE NOT EXISTS instead.)
insert into public.news_scout_config
  (schedule_enabled, schedule_type, schedule_value, search_engines, lookback_days)
select false, 'hours', 6, '["google","bing"]'::jsonb, 30
where not exists (select 1 from public.news_scout_config limit 1);

-- ── View ───────────────────────────────────────────────────────────────────
create or replace view public.v_news_sources_by_location as
select
  county_name,
  city,
  postcode,
  count(*)                           as source_count,
  count(*) filter (where active)     as active_source_count,
  max(last_seen_at)                  as latest_seen_at,
  max(last_match_at)                 as latest_match_at
from public.news_source_channels
group by county_name, city, postcode;

-- ── Upsert helper ──────────────────────────────────────────────────────────
create or replace function public.upsert_news_source_channel(
  p_county_name          text,
  p_city                 text,
  p_postcode             text,
  p_normalized_city      text,
  p_source_name          text,
  p_source_type          public.news_source_type,
  p_source_base_url      text,
  p_source_search_url    text,
  p_categories_supported jsonb,
  p_discovery_method     text,
  p_confidence_score     numeric,
  p_notes                text,
  p_metadata             jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id        uuid;
  v_canonical text;
begin
  v_canonical := public.normalize_url_for_channel(p_source_base_url);

  insert into public.news_source_channels (
    county_name, city, postcode, normalized_city, source_name,
    source_type, source_base_url, canonical_source_base_url,
    source_search_url, categories_supported, discovery_method,
    first_seen_at, last_seen_at, active, confidence_score, notes, metadata
  )
  values (
    p_county_name, p_city, p_postcode, p_normalized_city, p_source_name,
    p_source_type, p_source_base_url, v_canonical,
    p_source_search_url,
    coalesce(p_categories_supported, '[]'::jsonb),
    p_discovery_method,
    now(), now(), true,
    coalesce(p_confidence_score, 0.500),
    p_notes,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict on constraint news_source_channels_unique_channel
  do update set
    county_name          = excluded.county_name,
    normalized_city      = excluded.normalized_city,
    -- keep existing source_name if the new one is null
    source_name          = coalesce(excluded.source_name,          news_source_channels.source_name),
    source_type          = excluded.source_type,
    source_base_url      = excluded.source_base_url,
    source_search_url    = coalesce(excluded.source_search_url,    news_source_channels.source_search_url),
    -- merge category arrays: keep existing if new is empty, otherwise union
    categories_supported = case
      when news_source_channels.categories_supported = '[]'::jsonb then excluded.categories_supported
      when excluded.categories_supported             = '[]'::jsonb then news_source_channels.categories_supported
      else (
        select jsonb_agg(distinct elem)
        from jsonb_array_elements(
          news_source_channels.categories_supported || excluded.categories_supported
        ) as elem
      )
    end,
    discovery_method     = coalesce(excluded.discovery_method,     news_source_channels.discovery_method),
    last_seen_at         = now(),
    active               = true,
    confidence_score     = greatest(news_source_channels.confidence_score, excluded.confidence_score),
    notes                = coalesce(excluded.notes,                news_source_channels.notes),
    metadata             = news_source_channels.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;
