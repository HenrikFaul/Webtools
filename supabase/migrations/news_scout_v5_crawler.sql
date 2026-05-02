-- News Scout v5: Saját web crawler infrastruktúra
-- Független, magyarországi közérdekű híreket begyűjtő kereső
-- Apply AFTER news_scout_v4_feed_url.sql in Supabase SQL Editor

-- ── crawl_seeds: kiindulópontok a crawlernek ───────────────────────────────
create table if not exists public.crawl_seeds (
  id                     uuid         primary key default gen_random_uuid(),
  url                    text         not null unique,
  domain                 text         not null,
  source_type            text         not null default 'other_public_interest',
  label                  text,
  county                 text,
  city                   text,
  postcode               text,
  active                 boolean      not null default true,
  is_rss                 boolean      not null default false,
  crawl_interval_minutes integer      not null default 120,
  crawl_depth_limit      integer      not null default 2,
  last_crawled_at        timestamptz,
  created_at             timestamptz  not null default now(),
  updated_at             timestamptz  not null default now()
);

drop trigger if exists trg_crawl_seeds_updated_at on public.crawl_seeds;
create trigger trg_crawl_seeds_updated_at
  before update on public.crawl_seeds
  for each row execute function public.set_updated_at();

create index if not exists idx_crawl_seeds_domain
  on public.crawl_seeds (domain);
create index if not exists idx_crawl_seeds_active
  on public.crawl_seeds (active)
  where active = true;
create index if not exists idx_crawl_seeds_last_crawled
  on public.crawl_seeds (last_crawled_at nulls first);

-- ── crawl_queue: várakozó URL-ek ───────────────────────────────────────────
create table if not exists public.crawl_queue (
  id            uuid        primary key default gen_random_uuid(),
  url           text        not null unique,
  domain        text        not null,
  seed_id       uuid        references public.crawl_seeds (id) on delete set null,
  depth         integer     not null default 0,
  parent_url    text,
  priority      integer     not null default 5,  -- 1=legmagasabb, 10=legalacsonyabb
  is_rss        boolean     not null default false,
  status        text        not null default 'pending'
    constraint crawl_queue_status_chk
      check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  attempts      integer     not null default 0,
  scheduled_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_crawl_queue_status_priority
  on public.crawl_queue (status, priority, scheduled_at)
  where status = 'pending';
create index if not exists idx_crawl_queue_domain
  on public.crawl_queue (domain);
create index if not exists idx_crawl_queue_seed_id
  on public.crawl_queue (seed_id);

-- ── crawl_index: indexelt tartalom (keresési alap) ─────────────────────────
create table if not exists public.crawl_index (
  id               uuid         primary key default gen_random_uuid(),
  url              text         not null,
  canonical_url    text         not null unique,
  domain           text         not null,
  title            text,
  snippet          text,        -- első ~500 karakter
  published_at     timestamptz,
  crawled_at       timestamptz  not null default now(),
  is_rss_item      boolean      not null default false,
  feed_url         text,
  source_type      text,
  county           text,
  city             text,
  postcode         text,
  categories       text[]       not null default '{}',
  relevance_score  float        not null default 0.5
    constraint crawl_index_relevance_chk check (relevance_score between 0 and 1),
  -- Teljes szöveges keresővector (simple = ékezetérzékeny de megbízható)
  search_tsv       tsvector generated always as (
    to_tsvector('simple',
      coalesce(title,   '') || ' ' ||
      coalesce(snippet, '') || ' ' ||
      coalesce(city,    '') || ' ' ||
      coalesce(county,  '')
    )
  ) stored,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

drop trigger if exists trg_crawl_index_updated_at on public.crawl_index;
create trigger trg_crawl_index_updated_at
  before update on public.crawl_index
  for each row execute function public.set_updated_at();

create index if not exists idx_crawl_index_tsv
  on public.crawl_index using gin (search_tsv);
create index if not exists idx_crawl_index_domain
  on public.crawl_index (domain);
create index if not exists idx_crawl_index_published_at
  on public.crawl_index (published_at desc nulls last);
create index if not exists idx_crawl_index_crawled_at
  on public.crawl_index (crawled_at desc);
create index if not exists idx_crawl_index_categories
  on public.crawl_index using gin (categories);
create index if not exists idx_crawl_index_city_postcode
  on public.crawl_index (city, postcode);

-- ── crawl_domain_rate: domainnkénti rate-limiting nyomonkövetés ───────────
create table if not exists public.crawl_domain_rate (
  domain         text        primary key,
  last_fetch_at  timestamptz not null default now(),
  fetch_count    integer     not null default 0,
  error_count    integer     not null default 0,
  blocked_until  timestamptz
);

-- ── Nézet: crawler állapot összefoglaló ───────────────────────────────────
create or replace view public.v_crawler_status as
select
  (select count(*) from public.crawl_seeds where active = true)              as active_seeds,
  (select count(*) from public.crawl_queue where status = 'pending')         as queue_pending,
  (select count(*) from public.crawl_queue where status = 'processing')      as queue_processing,
  (select count(*) from public.crawl_queue where status = 'done')            as queue_done,
  (select count(*) from public.crawl_queue where status = 'failed')          as queue_failed,
  (select count(*) from public.crawl_index)                                  as index_total,
  (select count(*) from public.crawl_index where is_rss_item = true)         as index_rss_items,
  (select max(crawled_at) from public.crawl_index)                           as last_crawled_at,
  (select count(*) from public.crawl_index
   where crawled_at > now() - interval '24 hours')                           as indexed_last_24h;

-- ── Előre feltöltött seed-ek: ismert magyar közérdekű oldalak ─────────────
-- Kormányzati és hatósági főoldalak
insert into public.crawl_seeds (url, domain, source_type, label, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink',      'police.hu',           'police',               'Rendőrség – Legfrissebb hírek',       false, 1, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/feed', 'police.hu',           'police',               'Rendőrség RSS',                       true,  0, 30),
  ('https://www.katasztrofavedelem.hu/hirek',                                 'katasztrofavedelem.hu','disaster_management',  'Katasztrófavédelem – Hírek',          false, 1, 60),
  ('https://njt.hu/aktualis',                                                 'njt.hu',              'gazette_legal',        'Nemzeti Jogszabálytár – Aktuális',    false, 1, 120),
  ('https://magyarkozlony.hu',                                                'magyarkozlony.hu',    'gazette_legal',        'Magyar Közlöny',                      false, 1, 120),
  ('https://palyazat.gov.hu/hirek',                                           'palyazat.gov.hu',     'eu_funding',           'Pályázat.gov.hu – Hírek',             false, 1, 120),
  ('https://www.neak.gov.hu/felso_menu/lakossagnak/aktualis',                 'neak.gov.hu',         'healthcare',           'NEAK – Aktuális',                     false, 1, 180),
  ('https://www.antsz.hu/hirek',                                              'antsz.hu',            'healthcare',           'ÁNTSZ – Hírek',                       false, 1, 180),
  ('https://www.ksh.hu/hirek-kozzetetelei',                                   'ksh.hu',              'authority',            'KSH – Hírek',                         false, 1, 240),
  ('https://www.ogyei.gov.hu/hirek',                                          'ogyei.gov.hu',        'healthcare',           'OGYÉI – Hírek',                       false, 1, 240)
on conflict (url) do nothing;

-- Helyi hírportálok RSS feed-ek
insert into public.crawl_seeds (url, domain, source_type, label, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://www.hirado.hu/rss',                        'hirado.hu',        'regional_news', 'Híradó.hu RSS',              true, 0, 30),
  ('https://www.origo.hu/contentpartner/rss.html',     'origo.hu',         'regional_news', 'Origo RSS',                  true, 0, 30),
  ('https://hvg.hu/rss',                               'hvg.hu',           'regional_news', 'HVG RSS',                    true, 0, 30),
  ('https://index.hu/24ora/rss/',                      'index.hu',         'regional_news', 'Index.hu RSS',               true, 0, 30),
  ('https://telex.hu/rss',                             'telex.hu',         'regional_news', 'Telex RSS',                  true, 0, 30),
  ('https://444.hu/feed',                              '444.hu',           'regional_news', '444.hu RSS',                 true, 0, 30),
  ('https://magyarnemzet.hu/feed',                     'magyarnemzet.hu',  'regional_news', 'Magyar Nemzet RSS',          true, 0, 30),
  ('https://mno.hu/rss/rss.xml',                       'mno.hu',           'regional_news', 'Magyar Nemzet Online RSS',   true, 0, 30),
  ('https://www.portfolio.hu/rss/all.xml',             'portfolio.hu',     'regional_news', 'Portfolio RSS',              true, 0, 60),
  ('https://www.napi.hu/rss/all.xml',                  'napi.hu',          'regional_news', 'Napi.hu RSS',                true, 0, 60)
on conflict (url) do nothing;

-- Regionális hírportálok RSS feed-ek
insert into public.crawl_seeds (url, domain, source_type, label, county, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://www.boon.hu/rss',        'boon.hu',       'regional_news', 'Borsod Online (BAZ megye)',          'Borsod-Abaúj-Zemplén', true, 0, 60),
  ('https://www.baon.hu/rss',        'baon.hu',       'regional_news', 'Bács-Kiskun Online',                 'Bács-Kiskun',          true, 0, 60),
  ('https://www.beol.hu/rss',        'beol.hu',       'regional_news', 'Békés Online',                       'Békés',                true, 0, 60),
  ('https://www.feol.hu/rss',        'feol.hu',       'regional_news', 'Fejér Online',                       'Fejér',                true, 0, 60),
  ('https://www.gyorplus.hu/rss',    'gyorplus.hu',   'regional_news', 'Győr+',                              'Győr-Moson-Sopron',    true, 0, 60),
  ('https://www.haon.hu/rss',        'haon.hu',       'regional_news', 'Hajdú-Bihar Online',                 'Hajdú-Bihar',          true, 0, 60),
  ('https://www.heol.hu/rss',        'heol.hu',       'regional_news', 'Heves Online',                       'Heves',                true, 0, 60),
  ('https://www.kemma.hu/rss',       'kemma.hu',      'regional_news', 'Komárom-Esztergom megye',            'Komárom-Esztergom',    true, 0, 60),
  ('https://www.nograd.hu/rss',      'nograd.hu',     'regional_news', 'Nógrád megye',                       'Nógrád',               true, 0, 60),
  ('https://www.peol.hu/rss',        'peol.hu',       'regional_news', 'Pest Online',                        'Pest',                 true, 0, 60),
  ('https://www.sonline.hu/rss',     'sonline.hu',    'regional_news', 'Somogy Online',                      'Somogy',               true, 0, 60),
  ('https://www.szabolcsonline.hu/rss','szabolcsonline.hu','regional_news','Szabolcs Online',                 'Szabolcs-Szatmár-Bereg',true, 0, 60),
  ('https://www.teol.hu/rss',        'teol.hu',       'regional_news', 'Tolna Online',                       'Tolna',                true, 0, 60),
  ('https://www.vaol.hu/rss',        'vaol.hu',       'regional_news', 'Vas Online',                         'Vas',                  true, 0, 60),
  ('https://www.veol.hu/rss',        'veol.hu',       'regional_news', 'Veszprém Online',                    'Veszprém',             true, 0, 60),
  ('https://www.zaol.hu/rss',        'zaol.hu',       'regional_news', 'Zala Online',                        'Zala',                 true, 0, 60),
  ('https://www.szon.hu/rss',        'szon.hu',       'regional_news', 'Szolnok Online (Jász-Nagykun)',      'Jász-Nagykun-Szolnok', true, 0, 60),
  ('https://www.dunaujvaros.com/rss', 'dunaujvaros.com','local_news',  'Dunaújváros.com',                    'Fejér',                true, 0, 60),
  ('https://pecsiujsag.hu/feed',     'pecsiujsag.hu', 'local_news',    'Pécsi Újság RSS',                    'Baranya',              true, 0, 60),
  ('https://www.delmagyar.hu/rss',   'delmagyar.hu',  'regional_news', 'Délmagyarország (Csongrád-Csanád)',  'Csongrád-Csanád',      true, 0, 60)
on conflict (url) do nothing;

-- Budapest főbb önkormányzati oldalak
insert into public.crawl_seeds (url, domain, source_type, label, city, postcode, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://budapest.hu/Lapok/Hirek.aspx',      'budapest.hu',      'municipality', 'Budapest Főváros – Hírek',      'Budapest', '1011', false, 1, 120),
  ('https://www.bpxiii.hu/hirek',               'bpxiii.hu',        'municipality', 'XIII. kerület – Hírek',         'Budapest', '1130', false, 1, 120),
  ('https://www.ujbuda.hu/hirek',               'ujbuda.hu',        'municipality', 'Újbuda (XI. kerület) – Hírek',  'Budapest', '1111', false, 1, 120),
  ('https://kobanya.hu/hirek',                  'kobanya.hu',       'municipality', 'Kőbánya (X. kerület) – Hírek',  'Budapest', '1100', false, 1, 120),
  ('https://www.zuglo.hu/hirek',                'zuglo.hu',         'municipality', 'Zugló (XIV. kerület) – Hírek',  'Budapest', '1145', false, 1, 120),
  ('https://www.ferencvaros.hu/hirek',          'ferencvaros.hu',   'municipality', 'Ferencváros (IX. kerület)',      'Budapest', '1090', false, 1, 120)
on conflict (url) do nothing;

-- Vidéki nagyvárosok önkormányzati oldalak
insert into public.crawl_seeds (url, domain, source_type, label, city, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://www.miskolc.hu/hirek',              'miskolc.hu',       'municipality', 'Miskolc MJV – Hírek',     'Miskolc',     false, 1, 120),
  ('https://www.debrecen.hu/hu/hirek',          'debrecen.hu',      'municipality', 'Debrecen MJV – Hírek',    'Debrecen',    false, 1, 120),
  ('https://www.szeged.hu/hirek',               'szeged.hu',        'municipality', 'Szeged MJV – Hírek',      'Szeged',      false, 1, 120),
  ('https://www.pecs.hu/hirek',                 'pecs.hu',          'municipality', 'Pécs MJV – Hírek',        'Pécs',        false, 1, 120),
  ('https://www.gyor.hu/hirek',                 'gyor.hu',          'municipality', 'Győr MJV – Hírek',        'Győr',        false, 1, 120),
  ('https://www.nyiregyhaza.hu/hirek',          'nyiregyhaza.hu',   'municipality', 'Nyíregyháza MJV – Hírek', 'Nyíregyháza', false, 1, 120),
  ('https://www.kecskemeti.hu/hirek',           'kecskemeti.hu',    'municipality', 'Kecskemét MJV – Hírek',   'Kecskemét',   false, 1, 120),
  ('https://www.szekesfehervar.hu/hirek',       'szekesfehervar.hu','municipality', 'Székesfehérvár – Hírek',  'Székesfehérvár',false, 1, 120),
  ('https://www.bekescsaba.hu/hirek',           'bekescsaba.hu',    'municipality', 'Békéscsaba – Hírek',      'Békéscsaba',  false, 1, 120),
  ('https://www.veszprem.hu/hirek',             'veszprem.hu',      'municipality', 'Veszprém MJV – Hírek',    'Veszprém',    false, 1, 120),
  ('https://www.szolnok.hu/hirek',              'szolnok.hu',       'municipality', 'Szolnok MJV – Hírek',     'Szolnok',     false, 1, 120),
  ('https://www.kaposvar.hu/hirek',             'kaposvar.hu',      'municipality', 'Kaposvár MJV – Hírek',    'Kaposvár',    false, 1, 120),
  ('https://www.eger.hu/hirek',                 'eger.hu',          'municipality', 'Eger MJV – Hírek',        'Eger',        false, 1, 120),
  ('https://www.zalaegerszeg.hu/hirek',         'zalaegerszeg.hu',  'municipality', 'Zalaegerszeg MJV – Hírek','Zalaegerszeg',false, 1, 120),
  ('https://www.szombathely.hu/hirek',          'szombathely.hu',   'municipality', 'Szombathely MJV – Hírek', 'Szombathely', false, 1, 120),
  ('https://www.sopron.hu/hirek',               'sopron.hu',        'municipality', 'Sopron MJV – Hírek',      'Sopron',      false, 1, 120),
  ('https://www.tatabanya.hu/hirek',            'tatabanya.hu',     'municipality', 'Tatabánya MJV – Hírek',   'Tatabánya',   false, 1, 120),
  ('https://www.szekszard.hu/hirek',            'szekszard.hu',     'municipality', 'Szekszárd MJV – Hírek',   'Szekszárd',   false, 1, 120),
  ('https://www.nagykanizsa.hu/hirek',          'nagykanizsa.hu',   'municipality', 'Nagykanizsa MJV – Hírek', 'Nagykanizsa', false, 1, 120),
  ('https://www.dunaujvaros.hu/hirek',          'dunaujvaros.hu',   'municipality', 'Dunaújváros MJV – Hírek', 'Dunaújváros', false, 1, 120)
on conflict (url) do nothing;

-- Rendőrségi területi szervek RSS
insert into public.crawl_seeds (url, domain, source_type, label, county, is_rss, crawl_depth_limit, crawl_interval_minutes) values
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/bors-m-rszfo',  'police.hu', 'police', 'Rendőrség – Borsod-Abaúj-Zemplén',     'Borsod-Abaúj-Zemplén',  false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/bacs-m-rszfo',  'police.hu', 'police', 'Rendőrség – Bács-Kiskun',               'Bács-Kiskun',           false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/bek-m-rszfo',   'police.hu', 'police', 'Rendőrség – Békés',                     'Békés',                 false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/fej-m-rszfo',   'police.hu', 'police', 'Rendőrség – Fejér',                     'Fejér',                 false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/gyms-m-rszfo',  'police.hu', 'police', 'Rendőrség – Győr-Moson-Sopron',         'Győr-Moson-Sopron',     false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/haj-m-rszfo',   'police.hu', 'police', 'Rendőrség – Hajdú-Bihar',               'Hajdú-Bihar',           false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/hev-m-rszfo',   'police.hu', 'police', 'Rendőrség – Heves',                     'Heves',                 false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/jnsz-m-rszfo',  'police.hu', 'police', 'Rendőrség – Jász-Nagykun-Szolnok',      'Jász-Nagykun-Szolnok',  false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/kom-m-rszfo',   'police.hu', 'police', 'Rendőrség – Komárom-Esztergom',         'Komárom-Esztergom',     false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/nog-m-rszfo',   'police.hu', 'police', 'Rendőrség – Nógrád',                    'Nógrád',                false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/pes-m-rszfo',   'police.hu', 'police', 'Rendőrség – Pest',                      'Pest',                  false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/som-m-rszfo',   'police.hu', 'police', 'Rendőrség – Somogy',                    'Somogy',                false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/szab-m-rszfo',  'police.hu', 'police', 'Rendőrség – Szabolcs-Szatmár-Bereg',    'Szabolcs-Szatmár-Bereg',false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/tol-m-rszfo',   'police.hu', 'police', 'Rendőrség – Tolna',                     'Tolna',                 false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/vas-m-rszfo',   'police.hu', 'police', 'Rendőrség – Vas',                       'Vas',                   false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/vesz-m-rszfo',  'police.hu', 'police', 'Rendőrség – Veszprém',                  'Veszprém',              false, 0, 60),
  ('https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/zal-m-rszfo',   'police.hu', 'police', 'Rendőrség – Zala',                      'Zala',                  false, 0, 60)
on conflict (url) do nothing;
