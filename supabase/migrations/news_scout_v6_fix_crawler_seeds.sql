-- News Scout v6: Crawler seed javítások
-- 1. Hibás police.hu county slug URL-ek törlése (404-et adtak vissza)
-- 2. Működő police.hu al-szekciók hozzáadása
-- 3. Néhány rossz RSS URL javítása
-- Apply in Supabase SQL Editor AFTER news_scout_v5_crawler.sql

-- ── 1. Töröljük a nem létező police.hu county slug seed-eket ──────────────
delete from public.crawl_seeds
where domain = 'police.hu'
  and url like '%/legfrissebb-hireink/%-m-rszfo%';

-- ── 2. Töröljük a hozzájuk tartozó queue elemeket is ──────────────────────
delete from public.crawl_queue
where domain = 'police.hu'
  and url like '%/legfrissebb-hireink/%-m-rszfo%';

-- ── 3. Működő police.hu al-szekciók hozzáadása ────────────────────────────
insert into public.crawl_seeds (url, domain, source_type, label, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/helyi-hirek',
   'police.hu', 'police', 'Rendőrség – Helyi hírek', false, 1, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/napi-hirek',
   'police.hu', 'police', 'Rendőrség – Napi hírek',  false, 1, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/balesetmegelozes',
   'police.hu', 'police', 'Rendőrség – Balesetmegelőzés', false, 1, 120),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/hatarrendeszet',
   'police.hu', 'police', 'Rendőrség – Határrendészet', false, 1, 120)
on conflict (url) do nothing;

-- ── 4. Hibásan jelölt RSS feed-ek javítása (ha nem valódi RSS) ────────────
-- gyorplus.hu - ezt ellenőrizni kell, de meghagyjuk egyelőre
-- nograd.hu rss - ellenőrizni kell
-- Rossz URL-ek deaktiválása amelyek konzisztensen hibásak
update public.crawl_seeds set active = false
where url in (
  'https://mno.hu/rss/rss.xml'   -- mno.hu megszűnt, Magyar Nemzet lett
)
  and active = true;

-- ── 5. Korábban hibás queue elemek (failed) visszaállítása pending-re ─────
-- A User-Agent ByteString hiba miatt meghibásodott elemek újrapróbálása
update public.crawl_queue
set status       = 'pending',
    error_message = null,
    attempts      = 0,
    scheduled_at  = now()
where status = 'failed'
  and error_message like '%ByteString%';

-- ── 6. Ragadt "processing" elemek visszaállítása (ha a szerver összeomlott) ─
update public.crawl_queue
set status       = 'pending',
    started_at   = null,
    scheduled_at = now()
where status = 'processing'
  and started_at < now() - interval '30 minutes';
