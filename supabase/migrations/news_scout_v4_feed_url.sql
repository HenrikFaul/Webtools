-- News Scout v4: feed_url column + RSS-aware upsert function
-- Apply AFTER news_scout_v3_api_keys.sql in Supabase SQL Editor (geodata project)

-- ── feed_url column ────────────────────────────────────────────────────────
alter table public.news_source_channels
  add column if not exists feed_url text;

create index if not exists idx_news_source_channels_feed_url
  on public.news_source_channels (feed_url)
  where feed_url is not null;

-- ── RSS-aware upsert helper ────────────────────────────────────────────────
-- Replaces the v1 version; adds feed_url parameter.
-- The canonical unique constraint (city, postcode, canonical_source_base_url)
-- is preserved; feed_url is updated on conflict.
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
  p_metadata             jsonb,
  p_feed_url             text default null
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
    source_search_url, feed_url, categories_supported, discovery_method,
    first_seen_at, last_seen_at, active, confidence_score, notes, metadata
  )
  values (
    p_county_name, p_city, p_postcode, p_normalized_city, p_source_name,
    p_source_type, p_source_base_url, v_canonical,
    p_source_search_url, p_feed_url,
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
    source_name          = coalesce(excluded.source_name,          news_source_channels.source_name),
    source_type          = excluded.source_type,
    source_base_url      = excluded.source_base_url,
    source_search_url    = coalesce(excluded.source_search_url,    news_source_channels.source_search_url),
    feed_url             = coalesce(excluded.feed_url,             news_source_channels.feed_url),
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
