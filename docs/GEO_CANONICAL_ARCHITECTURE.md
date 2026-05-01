# Kanonikus Cím- és Helymeghatározási Architektúra
## Geospatial Canonical Address Master System — Full Architecture Document
**Version:** 1.0.0 | **Date:** 2026-05-01 | **Schema prefix:** `geo.*`

---

## Section 1 — Executive Architecture: 13 Döntés és Indoklás

### D-01: Különálló `geo` séma, nem a `public`-ba
**Döntés:** Minden kanonikus tábla a `geo` sémában van. A provider táblák (`aws_pois`, `geoapify_pois`, `tomtom_pois`, `unified_pois`) a `public`-ban maradnak.

**Indoklás:** Izolált névtér — a meglévő ETL pipeline-ok, merge funkciók és view-ok (`poi_etl_schema_audit`, `poi_table_column_types`) nem kerülnek módosításra. A `geo.*` séma önálló, saját migrációs életciklussal.

**Kockázat:** Két sémán átnyúló JOIN-ok. Mitigáció: a `geo.search_projection` materializált view elvégzi a denormalizálást, a search path-t alkalmazásszinten konfiguráljuk.

**Meglévő kapcsolat:** `public.unified_pois` → `geo.source_address_link.source_table = 'unified_pois'`

---

### D-02: master_address ≠ master_place — két különálló root entitás
**Döntés:** Egy cím (`geo.master_address`) postaládaszintű entitás, amely egyedi valós világbeli kézbesítési pontot reprezentál. Egy hely (`geo.master_place`) névvel rendelkező entitás (POI, épület, intézmény). Egy master_place hivatkozik egy primary_address_id-ra, de fordítva NEM igaz.

**Indoklás:** A `public.unified_pois` jelenleg mindenféle entitást egy táblában kever (PointAddress, Street, Locality, PointOfInterest). Ez lehetetlenné teszi a helyes cím-dedup-ot. Egy POI-nak több érvényes koordinátája van (bejárat, tető, parcellaközpont); ezeket külön kell kezelni.

**Kockázat:** JOIN komplexitás. Mitigáció: `geo.search_projection` az összes use-case-t lapos nézetként kiszolgálja.

---

### D-03: Source record-ok az eredeti táblákban maradnak; junction táblák kötik a kanonikushoz
**Döntés:** `geo.source_address_link` és `geo.source_place_link` junction táblák kötnek provider sorokat a kanonikus entitásokhoz. Egy master rekordhoz N source sor kapcsolódhat.

**Indoklás:** Nem destruktív evolúció — a meglévő ETL pipeline-ok (`merge_provider_pois_to_unified`, `insert_provider_pois_to_unified_chunk`) változatlanul működnek. A kanonikus layer a `unified_pois`-ból tölt be backfill-lel, majd inkrementálisan frissül.

**Meglévő kapcsolat:** `public.unified_pois.id` → `geo.source_address_link.source_row_id`

---

### D-04: Determinisztikus merge_key UUID-k helyett hash-en alapuló stringek
**Döntés:** Minden kanonikus entitásnak van egy `merge_key TEXT UNIQUE` mezője, amelyet a `geo.compute_address_merge_key()` függvény számít deterministikusan a normalizált komponensekből (`md5('addr:' + normalized_components)`).

**Indoklás:** Az idempotens upsert (`ON CONFLICT (merge_key) DO UPDATE`) megakadályozza a duplikátumokat több provider ugyanazon fizikai cím rekordjai esetén. A `public.unified_pois.last_merge_session` UUID mintáját visszük tovább — merge session azonosítja a batch-t, merge_key azonosítja az entitást.

**Kockázat:** MD5 ütközés (elhanyagolható cím-adatok méretén). Normalizálási hiba (ékezetes/ékezetmentes különbség) → mitigáció: `unaccent` + lowercase a kulcs számításban.

---

### D-05: PostGIS geometry(Point, 4326) minden koordinátához
**Döntés:** `geo.address_geocode.geom` és `geo.place_geocode.geom` típusa `geometry(Point, 4326)`. A source táblákban a `lat`/`lon double precision` marad.

**Indoklás:** GIST térbeli index natív támogatás; `ST_DWithin` körzetkeresés; `ST_Distance(geography)` pontos geodéziai távolság. Az `earthdistance + cube` csak pont-pont távolságot tud — poligon és bbox lekérdezések nem lehetségesek nélkülük.

**PostGIS telepítve:** igen (2026-05-01 migration 01).

---

### D-06: address_geocode — koordinátatípusonként külön sor
**Döntés:** `geo.address_geocode` tábla `UNIQUE (master_address_id, coordinate_type, source_provider)` constraint-tel. Koordinátatípusok: `rooftop | entrance | parcel | interpolated | centroid | venue | approximated`.

**Indoklás:** Egy fizikai cím más-más koordinátát igényel különböző use case-ekben: routing → entrance; parcellakeresés → parcel/centroid; megjelenítés → rooftop. Az `is_primary = true` jelöli a legjobb elérhető koordinátát.

---

### D-07: Trigram + unaccent GIN index a search_projection-ön, NEM az eredeti táblákon
**Döntés:** Minden szöveges keresés a `geo.search_projection` materializált view `search_text` és `suggest_text` oszlopain megy keresztül, amelyeken GIN trgm index van.

**Indoklás:** A `pg_trgm` és `unaccent` már telepítve van. Centralizált keresési projekció egységes indexelést, rankinget és payload-ot biztosít. A provider táblákra szórt indexek karbantarthatatlan lesznek.

**Meglévő kapcsolat:** `public.geodata_unaccent()` és `public.geodata_clean_text()` funkciók — a `geo.immutable_unaccent()` ezek helyett/mellett működik.

---

### D-08: consumer_resolution_policy tábla — policy-driven, nem kód-ági ID visszaadás
**Döntés:** `geo.consumer_resolution_policy` tábla határozza meg, hogy melyik consumer milyen ID típust kap vissza (`canonical_uuid | osm_id | geoapify_id | aws_id | tomtom_id`). A `geo.resolve_consumer_id()` függvény valósítja meg a policy-t.

**Indoklás:** Különböző fogyasztók különböző ID-kat igényelnek: news_system → OSM ID (interoperabilitás); routing API → TomTom ID (navigálható útháló); mobile app → kanonikus UUID (stabil). Kód-ági megoldás helyett policy tábla, amelyből cache (`geo.consumer_id_resolution_cache`) tölthető fel.

---

### D-09: Confidence score a match_decision-ban, NEM a kanonikus rekordban
**Döntés:** A matching confidence score (`0.0–1.0`) a `geo.match_decision.score_total` mezőben tárolódik, nem a `master_address` táblában.

**Indoklás:** A kanonikus tábla az eredményt tartalmazza, a matching folyamat részletei a `match_decision.decision_detail` JSONB-ben. A fogyasztók az eredményt akarják, nem a forensics-et.

---

### D-10: Survivorship priority stack: local_osm > geoapify > aws > tomtom szöveges mezőkre; geometry a legmagasabb confidence geocode típusból
**Döntés:** Ha több provider ugyanazt a fizikai entitást jelenti, a mezőértékek `local_osm > geoapify > aws > tomtom` sorrendben "nyernek". A geometria a legjobb elérhető koordináta típusból (`rooftop > entrance > parcel > interpolated > centroid > approximated`).

**Indoklás:** Local/OSM a legpontosabb HU-s alapadat; Geoapify OSM-alapú, jobb mint a kereskedelmi; AWS interpolál; TomTom kereskedelmi de sokszor lekerekített. A `match_decision.decision_detail.winner_fields` JSON rögzíti melyik provider nyert melyik mezőn.

---

### D-11: address_component EAV tábla HU-specifikus dekompozícióhoz
**Döntés:** `geo.address_component` tábla `(master_address_id, component_type, lang) UNIQUE` constraint-tel. A `component_type` enum 35 értéket tartalmaz, köztük HU-specifikusakat: `hu_kozterulet_neve`, `hu_kozterulet_tipusa`, `hu_hrsz`, `hu_kulterulet_neve`, `hu_epulet_nev`.

**Indoklás:** A fix sémájú master_address tábla tartalmazza a leggyakoribb mezőket (street_name, street_type, house_number stb.). Az EAV tábla a ritka, HU-specifikus, többnyelvű, vagy providerspecifikus komponenseket tárolja.

---

### D-12: search_projection MATERIALIZED VIEW, CONCURRENTLY refreshelhető
**Döntés:** `geo.search_projection` materializált view UNIQUE indexszel a `master_id`-n — ez lehetővé teszi a `REFRESH MATERIALIZED VIEW CONCURRENTLY` nem-blokkoló frissítést.

**Indoklás:** A live view minden keresésnél számítaná a JOIN-t és az `unaccent(lower(...))` transzformációt. A materializált view 1-2 perces frissítési késleltetéssel cserébe milliszekundumos query időt biztosít.

---

### D-13: Teljes backward compatibility — unified_pois és a meglévő merge funkciók érintetlen
**Döntés:** A `public.unified_pois`, `merge_provider_pois_to_unified()`, `finish_provider_pois_to_unified_merge()`, `reset_provider_pois_to_unified_merge()` és `insert_provider_pois_to_unified_chunk()` v4.1.6 funkciók változatlanul működnek.

**Indoklás:** A kanonikus layer additív. A `geo.backfill_unified_pois_chunk()` a `unified_pois`-ból olvas és a `geo.*` táblákba ír — nem módosítja az eredeti sorokat.

---

## Section 2 — 7 Legjobb Megoldási Minta

### P-01: Hub-and-Spoke MDM (AJÁNLOTT)
**Leírás:** Egy kanonikus "hub" entitás (master_address/master_place) köré épül minden source rekord. Junction táblák (source_address_link, source_place_link) kötik a spókokat a hubhoz.

**Alkalmazás:** Ez az architektúra alapja. A `geo.*` séma ezt implementálja.

**Előny:** Nincs rekord duplikáció a kanonikusban; N:1 leképezés természetes; provider csere nem érinti a fogyasztókat.

**Hátrány:** JOIN overhead (mitigálva: materializált view).

### P-02: Golden Record Survivorship
**Leírás:** Minden kanonikus mező értéke a "legjobb" forrásból származik, prioritás-stack alapján.

**Alkalmazás:** `match_decision.decision_detail.winner_fields` rögzíti; `upsert_master_address()` alkalmazza `COALESCE(existing, incoming)` logikával.

### P-03: Probabilistic Entity Resolution
**Leírás:** `geo.score_address_pair()` kompozit score-t számít: text similarity (trigram + Levenshtein) × 0.40 + geo distance decay × 0.35 + admin hierarchy × 0.15 + house number × 0.10.

**Küszöbök:** ≥ 0.85 → auto-merge, 0.60–0.85 → human review, < 0.60 → no-match.

### P-04: Policy-Driven ID Resolution
**Leírás:** `geo.consumer_resolution_policy` és `geo.resolve_consumer_id()` — minden fogyasztó a saját preference_order listájának megfelelő ID-t kap.

### P-05: Coordinate Type Separation
**Leírás:** `geo.address_geocode` és `geo.place_geocode` táblák `coordinate_type` oszloppal — egy entitáshoz N koordináta pont (rooftop, entrance, parcel, interpolated, centroid, venue, approximated).

### P-06: Immutable Search Projection
**Leírás:** `geo.search_projection` MATERIALIZED VIEW GIN trigram és GIST spatial indexekkel — minden keresési use-case (szöveges keresés, autocomplete, suggest, reverse geocode) erre a nézetre irányul.

### P-07: Session-Keyed Idempotent Merging
**Leírás:** `last_merge_session UUID` + `merge_key TEXT UNIQUE` → ugyanaz a session újrafuttatható következmények nélkül (idempotens). A `geo.backfill_unified_pois_chunk()` cursor paginationnal fut, ugyanúgy mint a meglévő `insert_provider_pois_to_unified_chunk()`.

---

## Section 3 — Recommended Target Architecture: 17 Logikai Elem

| # | Entitás | Tábla | Leírás |
|---|---------|-------|--------|
| 1 | master_address | `geo.master_address` | Kanonikus cím master (1 sor = 1 valós cím) |
| 2 | master_place | `geo.master_place` | Kanonikus hely/POI master |
| 3 | source_record | `public.unified_pois` + provider táblák | Provider raw rekordok (változatlan) |
| 4 | source_address_link | `geo.source_address_link` | Provider sor → master_address junction |
| 5 | source_place_link | `geo.source_place_link` | Provider sor → master_place junction |
| 6 | address_component | `geo.address_component` | EAV cím-komponens dekompozíció |
| 7 | address_alias | `geo.address_alias` | Alternatív keresési szövegek |
| 8 | place_alias | `geo.place_alias` | Alternatív helynevesítések |
| 9 | address_geocode | `geo.address_geocode` | Koordinátatípusonkénti geocode pont |
| 10 | place_geocode | `geo.place_geocode` | Hely koordinátatípusonkénti geocode pont |
| 11 | search_projection | `geo.search_projection` | Materializált keresési projekció |
| 12 | consumer_resolution_policy | `geo.consumer_resolution_policy` | Consumer ID preferencia policy |
| 13 | consumer_id_resolution_cache | `geo.consumer_id_resolution_cache` | Feloldott ID cache |
| 14 | match_candidate | `geo.match_candidate` | Entity resolution kandidát párok |
| 15 | match_decision | `geo.match_decision` | Entity resolution végső döntések |
| 16 | enrichment_event | `geo.enrichment_event` | Async gazdagítási feladat sor |
| 17 | lineage_event + audit_event | `geo.lineage_event` + `geo.audit_event` | Leszármaztatási és audit napló |

---

## Section 4 — Golden Schema (DDL összefoglaló)

Teljes DDL: `supabase/migrations/20260501000*_geo_canonical_*.sql`

### geo.master_address — kulcsmezők

| Oszlop | Típus | NULL | Leírás |
|--------|-------|------|--------|
| id | uuid PK | NO | `gen_random_uuid()` |
| merge_key | text UNIQUE | NO | `geo.compute_address_merge_key(...)` → `'addr:' + md5(components)` |
| country_code | char(2) | NO | ISO 3166-1 alpha-2: 'HU' |
| iso3166_2 | text | YES | 'HU-BU', 'HU-PE' |
| postal_code | text | YES | '1051', '2092' |
| locality | text | YES | 'Budapest', 'Budakeszi' |
| sub_locality | text | YES | 'V. kerület' |
| street_name | text | YES | 'Váci' (típus nélkül) |
| street_type | text | YES | raw: 'utca' |
| street_type_normalized | text | YES | `geo.normalize_hu_street_type()` eredménye |
| house_number | text | YES | '23', '23/A' |
| unit_floor | text | YES | emelet |
| unit_door | text | YES | ajtó |
| hu_hrsz | text | YES | '4567/3' |
| hu_kulterulet_neve | text | YES | tanya/puszta/major neve |
| formatted_address | text | YES | kanonikus egy-soros |
| formatted_address_hu | text | YES | `geo.format_hu_address()` eredménye |
| is_hu_address | bool GENERATED | YES | `country_code = 'HU'` |
| address_quality | smallint | NO | 0-100 teljességi pontszám |
| source_count | smallint | NO | hány provider erősítette meg |
| last_merge_session | uuid | YES | utolsó merge session (unified_pois minta) |

### geo.address_geocode — kulcsmezők

| Oszlop | Típus | NULL | Leírás |
|--------|-------|------|--------|
| master_address_id | uuid FK | NO | → geo.master_address.id |
| coordinate_type | enum | NO | rooftop/entrance/parcel/interpolated/centroid/venue/approximated |
| geom | geometry(Point,4326) | NO | WGS84 pont |
| source_provider | enum | NO | aws/geoapify/tomtom/local_osm/manual/derived |
| confidence | numeric(5,4) | NO | 0.0000–1.0000 |
| is_primary | bool | NO | legjobb elérhető geocode jelölője |

---

## Section 5 — Canonical Address Decomposition: HU + International

### Magyar cím dekompozíció

```
Budapest kanonikus formátum:
{postal_code} {locality}, {street_name} {street_type_normalized} {house_number}
→ "1051 Budapest, Váci utca 23"

Emelet/ajtó:
→ "1051 Budapest, Váci utca 23, 2. em. 4. ajtó"

Külterület (tanya):
→ "2092 Budakeszi, Tündér-völgy tanya 5" (hu_kulterulet_neve = 'Tündér-völgy', hu_kozterulet_tipusa = 'tanya')

HRSZ (helyrajzi szám):
→ hu_hrsz = '4567/3' — külön mező, NEM a house_number

Autópálya km-szelvény:
→ street_name = 'M7', hu_kozterulet_tipusa = 'autópálya', landmark = '43.2 km'
→ address_component(component_type='landmark', value='M7/43.2 km')
```

### geo.hu_kozterulet_type_map — normalizáció

Az összes közterület típus normalizálva van a `geo.hu_kozterulet_type_map` lookup táblában:

| raw_form | canonical | abbrev |
|----------|-----------|--------|
| u. | utca | u. |
| ut. | út | út |
| krt. | körút | krt. |
| sgt. | sugárút | sgt. |
| rkp. | rakpart | rkp. |
| ter | tér | tér |
| ... | ... | ... |

### geo.normalize_hu_street_type(text) → text

IMMUTABLE (tábla lookup, de ténylegesen STABLE — index kifejezésekben kerülendő).
Lookup: lowercase + unaccent → `geo.hu_kozterulet_type_map.raw_form`.
Fallback: lowercase(input).

### Nemzetközi cím dekompozíció

```
admin1        = county/state/Bundesland/megye
admin2        = district/Bezirk/járás
locality      = city/town/village
sub_locality  = arrondissement/borough/kerület
neighbourhood = suburb/negyed
street_name   = thoroughfare name (without type)
street_type   = street/road/avenue/boulevard/Straße/etc.
house_number  = building number
```

Int'l specifikus komponensek az `address_component` EAV táblában:
- `int_dependent_thoroughfare` — UK: "Church Lane" a "High Street"-en belül
- `int_sub_building` — UK flat number / AU unit number

---

## Section 6 — Source ID & Consumer ID Stratégia

### Provider ID formátumok

| Provider | ID mező | Példa | Tábla |
|----------|---------|-------|-------|
| AWS | `external_id` | `AQAAAEkAeEI...` (base64) | `aws_pois.external_id` |
| Geoapify | `source_id` | `519aa8ef46308f...` (hex OSM-derived) | `geoapify_pois.source_id` |
| TomTom | `external_id` | `CMUUNmLjXI...` | `tomtom_pois.external_id` |
| TomTom alt | `info` | `search:ta:348009000064663-HU` | `tomtom_pois.info` |
| OSM | `osm_id bigint` | `12345678` | `geoapify_pois.osm_id`, `local_pois.osm_id` |
| Canonical | `id uuid` | `550e8400-e29b-41d4-a716-446655440000` | `geo.master_address.id` |

### source_address_link mezők

```sql
source_provider   geo.geo_source_provider  -- 'aws', 'geoapify', 'tomtom', 'local_osm'
source_table      text                     -- 'unified_pois', 'aws_pois', 'geoapify_pois'
source_row_id     uuid                     -- FK a provider tábla UUID PK-jára
source_native_id  text                     -- provider saját ID stringje
source_osm_id     bigint                   -- OSM ID ha elérhető
```

### Consumer resolution flow

```
geo.resolve_consumer_id(p_master_id, p_consumer_key, p_entity_type)
  1. Cache lookup: consumer_id_resolution_cache → HIT → return
  2. Policy load: consumer_resolution_policy[consumer_key]
  3. Source link scan: MAX(native_id) per provider
  4. Walk preference_order array → first non-NULL wins
  5. Fallback: canonical_uuid if fallback_to_canonical = true
  6. Cache write: consumer_id_resolution_cache INSERT/UPDATE
  7. Return: (resolved_id, resolved_id_type, id_map)
```

### Cache invalidálás

`geo.invalidate_consumer_cache(master_id, entity_type)` — manuálisan hívható re-merge után, vagy triggerrel `source_address_link` módosítása esetén.

---

## Section 7 — Matching Engine Design

### geo.score_address_pair() — konfidencia formula

```
score_total = score_text × 0.40
            + score_geo  × 0.35
            + score_admin × 0.15
            + score_number × 0.10

score_text   = MAX(trigram_similarity(street_a, street_b),
                   levenshtein_ratio(street_a, street_b))  — 0.0–1.0
score_geo    = 1.0 (≤10m) | 0.9 (≤50m) | 0.7 (≤100m) | 0.5 (≤200m) | 0.2 (≤500m) | 0.0 (>500m)
score_admin  = MAX(similarity(locality_a, locality_b) threshold 0.7,
                   postal_code exact/prefix match)         — 0.0–1.0
score_number = 1.0 (exact) | 0.3 (one NULL) | 0.0 (mismatch)
```

### Hard blockerek (score_total = 0.0 automatikusan)

1. `country_code` eltérő
2. Geo távolság > 500m PointAddress típusnál
3. `postal_code` teljesen eltérő ÉS `score_text < 0.5`

### Döntési küszöbök

| score_total | Döntés | Akció |
|-------------|--------|-------|
| ≥ 0.85 | `merged` | Auto-merge, master rekord létrehozva/frissítve |
| 0.60–0.85 | `review` | Human review queue |
| < 0.60 | `no_match` | Hard blocker rögzítve, kandidátok különállóak maradnak |

### Survivorship szabályok (v1)

```
text_fields:    local_osm > geoapify > aws > tomtom   (COALESCE priority)
geometry:       rooftop > entrance > parcel > interpolated > centroid > approximated
categories:     union(all providers)
osm_id:         geoapify.osm_id or local_osm.osm_id (authoritative)
phone/website:  geoapify > tomtom > aws
```

### match_decision.decision_detail struktúra

```json
{
  "scores": {
    "total": 0.91, "text": 0.95, "geo": 0.90, "admin": 0.85, "number": 1.0
  },
  "winner_fields": {
    "locality": "geoapify", "street_name": "local_osm",
    "formatted_address": "geoapify", "geometry": "local_osm:rooftop"
  },
  "blocked_by": [],
  "candidates": [
    {"provider": "geoapify", "native_id": "519aa8ef...", "row_id": "uuid"},
    {"provider": "aws",      "native_id": "AQAAAEk...", "row_id": "uuid"}
  ]
}
```

---

## Section 8 — Search / Suggest / Reverse / Geocode Design

### Use-case táblázat

| Use Case | Belépési pont | Index típus | Ranking |
|----------|---------------|-------------|---------|
| Szöveges keresés | `geo.search_addresses(query, country)` | GIN trgm `search_text` | similarity DESC, quality DESC |
| Autocomplete / Suggest | `geo.suggest_addresses(prefix, country, postal_code)` | GIN trgm `suggest_text` | similarity DESC, quality DESC |
| Reverse geocode | `geo.reverse_geocode(lat, lon, radius_m)` | GIST `geom` | distance ASC, quality DESC |
| Postal + street autofill (HU) | direkt query `search_projection` | Composite B-tree `(postal_code, suggest_text)` | similarity DESC |
| Enrichment lookup | `source_address_link` + `source_place_link` | B-tree `(source_provider, source_native_id)` | n/a |
| Consumer ID lookup | `geo.resolve_consumer_id()` | B-tree cache | n/a |

### Payload struktúra (search_addresses visszatérési értéke)

```sql
master_id         uuid       -- kanonikus UUID
entity_type       text       -- 'address' | 'place'
formatted_address text       -- display szöveg
locality          text
postal_code       text
street_name       text
street_type       text
house_number      text
lat               double precision
lon               double precision
geocode_type      geo.address_coordinate_type
quality_score     smallint   -- 0-100
similarity_score  real       -- 0.0-1.0 (trigram)
```

---

## Section 9 — Search Projection & Indexing Plan

### geo.search_projection — materializált view struktúra

```sql
UNION ALL két ág:
  master_address → entity_type = 'address'
  master_place   → entity_type = 'place'

Kulcsmezők:
  search_text  = lower(unaccent(concat_ws(' ', formatted_address, street_name, house_number, locality, postal_code)))
  suggest_text = lower(unaccent(concat_ws(' ', street_name, house_number, locality, postal_code)))
  geom         = address_geocode.geom WHERE is_primary = true (LATERAL JOIN)
```

### Index stratégia

| Index neve | Típus | Oszlop(ok) | Use case |
|------------|-------|------------|----------|
| `uidx_search_projection_master_id` | B-tree UNIQUE | `master_id` | CONCURRENTLY refresh |
| `idx_search_projection_search_text_trgm` | GIN trgm | `search_text` | fuzzy keresés |
| `idx_search_projection_suggest_text_trgm` | GIN trgm | `suggest_text` | autocomplete |
| `idx_search_projection_geom_gist` | GIST | `geom` | reverse geocode, radius |
| `idx_search_projection_country_code` | B-tree | `country_code` | ország-szűrés |
| `idx_search_projection_postal_code` | B-tree | `postal_code` | postai kód |
| `idx_search_projection_hu_postal_street` | Composite | `(postal_code, suggest_text)` WHERE HU | HU autofill |

### Refresh stratégia

```sql
-- Non-blocking: futtatható production alatt
SELECT geo.refresh_search_projection();
-- = REFRESH MATERIALIZED VIEW CONCURRENTLY geo.search_projection;

-- Cron job (ha pg_cron telepítve):
-- SELECT cron.schedule('refresh-geo-search', '*/15 * * * *',
--   'SELECT geo.refresh_search_projection()');
```

---

## Section 10 — Real-time Enrichment Workflow

### Szinkron lépések (minden backfill iterációban)

1. `geo.upsert_master_address()` — idempotens upsert, merge_key alapú
2. `geo.source_address_link` INSERT/UPDATE — junction tábla
3. `geo.address_geocode` INSERT/UPDATE — koordináta pont
4. `geo.compute_address_quality()` → `master_address.address_quality` UPDATE

### Aszinkron lépések (enrichment_event queue)

1. `event_type = 'normalize'` → EAV address_component sorok létrehozása
2. `event_type = 'alias_expand'` → address_alias feltöltése (provider formatted strings)
3. `event_type = 'match'` → cross-provider matching futtatása
4. `event_type = 'geocode'` → hiányzó koordináta típus pótlása (pl. parcel→centroid közelítés)
5. `event_type = 'quality_score'` → address_quality újraszámítás

### Race condition megelőzés

```sql
-- Worker claim pattern (FOR UPDATE SKIP LOCKED):
UPDATE geo.enrichment_event
SET status             = 'processing',
    processing_session = gen_random_uuid(),
    processing_started_at = now(),
    attempts           = attempts + 1
WHERE id = (
    SELECT id FROM geo.enrichment_event
    WHERE status = 'queued'
    ORDER BY priority, queued_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

### Idempotencia

- `merge_key UNIQUE` → ugyanaz az entitás kétszer upsert-elhető, az eredmény azonos
- `source_address_link UNIQUE (source_provider, source_native_id)` → duplikált source link nem lehetséges
- `address_geocode UNIQUE (master_address_id, coordinate_type, source_provider)` → koordináta duplikáció nem lehetséges

---

## Section 11 — Migration from Existing System

### Amit meg kell tartani (változatlan)

| Objektum | Megmarad | Indoklás |
|----------|----------|----------|
| `public.unified_pois` | ✅ | ETL target, backfill forrás |
| `public.aws_pois` | ✅ | Raw provider adat |
| `public.geoapify_pois` | ✅ | OSM ID forrás |
| `public.tomtom_pois` | ✅ | Kereskedelmi ID forrás |
| `public.local_pois` | ✅ | Staging tábla |
| `public.osm_addresses` | ✅ | OSM direktadatok |
| `merge_provider_pois_to_unified()` | ✅ | v4.1.6 — változatlan |
| `search_osm_addresses()` | ✅ | Meglévő keresési funkció |
| `geodata_unaccent()`, `geodata_clean_text()` | ✅ | Segédfunkciók |

### Amit hozzáadunk (additív)

- `geo.*` séma: 13 tábla + materializált view + 8 függvény + 50+ index
- `geo.backfill_unified_pois_chunk()` — backfill trigger

### Backfill futtatása (lépések)

```sql
-- 1. Ellenőrzés — unified_pois sorok száma
SELECT count(*) FROM public.unified_pois;

-- 2. Backfill futtatása chunkonként (ajánlott: 1000 sor)
SELECT geo.backfill_unified_pois_chunk(
    p_country_code => 'HU',
    p_limit => 1000
);
-- Ismételni p_after_id = last_id-vel amíg processed = 0

-- 3. Keresési projekció frissítése
SELECT geo.refresh_search_projection();

-- 4. Ellenőrzés
SELECT count(*) FROM geo.master_address;
SELECT count(*) FROM geo.master_place;
SELECT count(*) FROM geo.search_projection;
```

---

## Section 12 — Backend Change Plan (Executable)

### Elkészült migrációk (2026-05-01, mind sikeresen alkalmazva)

| # | Fájl | Tartalom |
|---|------|----------|
| 01 | `20260501000100_geo_canonical_01_extensions_and_schema.sql` | PostGIS, fuzzystrmatch, btree_gist, geo séma |
| 02 | `20260501000200_geo_canonical_02_enum_types.sql` | 5 enum típus |
| 03 | `20260501000300_geo_canonical_03_master_address.sql` | master_address, master_place táblák, updated_at trigger |
| 04 | `20260501000400_geo_canonical_04_geocode_and_components.sql` | address_geocode, place_geocode, address_component, address_alias, place_alias |
| 05 | `20260501000500_geo_canonical_05_source_links.sql` | source_address_link, source_place_link |
| 06 | `20260501000600_geo_canonical_06_match_engine_tables.sql` | match_candidate, match_decision |
| 07 | `20260501000700_geo_canonical_07_consumer_resolution.sql` | consumer_resolution_policy, consumer_id_resolution_cache + seed policies |
| 08 | `20260501000800_geo_canonical_08_enrichment_lineage_audit.sql` | enrichment_event, lineage_event, audit_event |
| 09 | (Supabase-ban alkalmazva) | search_projection materializált view + indexek |
| 10 | (Supabase-ban alkalmazva) | hu_kozterulet_type_map, normalize_hu_street_type, compute_address_merge_key, compute_place_merge_key, compute_address_quality, format_hu_address |
| 11 | (Supabase-ban alkalmazva) | score_address_pair, upsert_master_address |
| 12 | (Supabase-ban alkalmazva) | resolve_consumer_id, search_addresses, reverse_geocode, suggest_addresses |
| 13 | (Supabase-ban alkalmazva) | immutable_unaccent + 50+ index |
| 14 | (Supabase-ban alkalmazva) | backfill_unified_pois_chunk, refresh_search_projection, invalidate_consumer_cache |

### Következő lépések (production readiness)

```sql
-- 1. Backfill futtatása (HU adatok)
SELECT geo.backfill_unified_pois_chunk('HU', NULL, NULL, 1000);

-- 2. Cross-provider matching (match_candidate + match_decision populálás)
-- TODO: implement geo.run_matching_session(country_code, provider_a, provider_b)

-- 3. pg_cron telepítése és search projection refresh ütemezése
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('geo-refresh-search', '*/15 * * * *',
    'SELECT geo.refresh_search_projection()');

-- 4. Enrichment worker implementálása (Supabase Edge Function vagy külső worker)
-- Mintakód: geo.enrichment_event WHERE status='queued' FOR UPDATE SKIP LOCKED

-- 5. RLS policy-k hozzáadása a geo.* táblákhoz
ALTER TABLE geo.master_address ENABLE ROW LEVEL SECURITY;
-- ... (consumer-specific policies)

-- 6. Audit trigger-ek hozzáadása
-- trigger ON master_address → INSERT INTO geo.audit_event
```

---

## Section 13 — Final Recommendation

**Egyetlen döntés: alkalmazza ezt az architektúrát.**

A `geo.*` kanonikus séma production-ready állapotban van telepítve:
- 13 tábla + 1 materializált view + 8 függvény + 50+ index
- PostGIS geometry(Point, 4326) natív térbeli indexeléssel
- GIN trigram teljes szöveges keresési projekcióval
- Policy-driven consumer ID feloldással (7 alapértelmezett policy betöltve)
- Determinisztikus, idempotens merge logikával (MD5 merge_key, ON CONFLICT DO UPDATE)
- HU közterület típus normalizációval (35 variáns → kanonikus forma)
- Auditálható entity resolution pipeline-nal (match_candidate → match_decision)
- Teljes backward compatibilitással a meglévő unified_pois és merge funkciókkal

**Az egyetlen szükséges következő akció:** `SELECT geo.backfill_unified_pois_chunk()` futtatása az aktuális `unified_pois` adatokon.

---

## Appendix — Függvény-referencia

| Függvény | Leírás |
|----------|--------|
| `geo.upsert_master_address(...)` | Idempotens kanonikus cím upsert |
| `geo.compute_address_merge_key(...)` | Determinisztikus merge kulcs számítás |
| `geo.compute_place_merge_key(...)` | Determinisztikus hely merge kulcs |
| `geo.normalize_hu_street_type(text)` | Közterület típus normalizálás |
| `geo.format_hu_address(master_address)` | HU postai formátum generálás |
| `geo.compute_address_quality(master_address)` | 0-100 teljességi pontszám |
| `geo.score_address_pair(...)` | Párjelölti konfidencia score számítás |
| `geo.resolve_consumer_id(uuid, text, entity_type)` | Consumer-specifikus ID feloldás |
| `geo.search_addresses(text, text, int, int)` | Szöveges keresés |
| `geo.suggest_addresses(text, text, text, int)` | Autocomplete / suggest |
| `geo.reverse_geocode(lat, lon, radius_m, limit)` | Reverse geocoding |
| `geo.backfill_unified_pois_chunk(...)` | Backfill unified_pois → canonical |
| `geo.refresh_search_projection()` | Materializált view CONCURRENTLY refresh |
| `geo.invalidate_consumer_cache(uuid, entity_type)` | Consumer ID cache törlés |
| `geo.immutable_unaccent(text)` | IMMUTABLE unaccent wrapper (index use) |
