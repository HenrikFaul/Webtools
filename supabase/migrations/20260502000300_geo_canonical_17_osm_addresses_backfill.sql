-- Migration: geo_canonical_17_osm_addresses_backfill
-- Tervezési hiba javítása: backfill_unified_pois_chunk() nem olvasta
-- a public.osm_addresses táblát (796K sor), csak unified_pois-t (16K sor).
--
-- Változások:
-- 1. backfill_job_state: source_table + last_cursor_bigint oszlopok
-- 2. geo.backfill_osm_addresses_chunk(): osm_addresses → geo.master_address
-- 3. geo.advance_backfill_job(): source_table dispatch
-- 4. geo.start_backfill_job(): p_source_table paraméter (régi 4-param DROP)

ALTER TABLE geo.backfill_job_state
    ADD COLUMN IF NOT EXISTS source_table       text   DEFAULT 'unified_pois',
    ADD COLUMN IF NOT EXISTS last_cursor_bigint bigint DEFAULT NULL;

CREATE OR REPLACE FUNCTION geo.backfill_osm_addresses_chunk(
    p_after_id   bigint  DEFAULT NULL,
    p_limit      integer DEFAULT 500,
    p_session_id uuid    DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_row               record;
    v_master_address_id uuid;
    v_locality          text;
    v_coord_type        geo.address_coordinate_type;
    v_processed         integer := 0;
    v_new_addresses     integer := 0;
    v_last_id           bigint;
BEGIN
    FOR v_row IN
        SELECT
            id, osm_id, osm_type, country_code,
            state, county,
            city, village, hamlet,
            district, suburb, neighbourhood,
            postcode,
            COALESCE(NULLIF(trim(street_name), ''), NULLIF(trim(street), '')) AS eff_street_name,
            street_type,
            house_number, house_number_suffix,
            floor, door, staircase,
            conscriptionnumber,
            display_name,
            lat, lon, geometry_type, interpolation
        FROM public.osm_addresses
        WHERE country_code IS NOT NULL
          AND (p_after_id IS NULL OR id > p_after_id)
        ORDER BY id ASC
        LIMIT p_limit
    LOOP
        v_last_id   := v_row.id;
        v_processed := v_processed + 1;

        v_locality := COALESCE(
            NULLIF(trim(coalesce(v_row.city,    '')), ''),
            NULLIF(trim(coalesce(v_row.village, '')), ''),
            NULLIF(trim(coalesce(v_row.hamlet,  '')), '')
        );

        v_coord_type := CASE
            WHEN v_row.interpolation IS NOT NULL        THEN 'interpolated'
            WHEN v_row.lat IS NOT NULL
             AND v_row.house_number IS NOT NULL         THEN 'rooftop'
            WHEN v_row.lat IS NOT NULL                  THEN 'approximated'
            ELSE NULL
        END;

        v_master_address_id := geo.upsert_master_address(
            p_country_code        := v_row.country_code,
            p_admin1              := NULLIF(trim(coalesce(v_row.state,   '')), ''),
            p_admin2              := NULLIF(trim(coalesce(v_row.county,  '')), ''),
            p_postal_code         := NULLIF(trim(coalesce(v_row.postcode, '')), ''),
            p_locality            := v_locality,
            p_sub_locality        := NULLIF(trim(coalesce(v_row.district, '')), ''),
            p_neighbourhood       := NULLIF(trim(coalesce(v_row.suburb, v_row.neighbourhood, '')), ''),
            p_street_name         := NULLIF(trim(coalesce(v_row.eff_street_name, '')), ''),
            p_street_type         := NULLIF(trim(coalesce(v_row.street_type, '')), ''),
            p_house_number        := NULLIF(trim(coalesce(v_row.house_number, '')), ''),
            p_house_number_suffix := NULLIF(trim(coalesce(v_row.house_number_suffix, '')), ''),
            p_unit_floor          := NULLIF(trim(coalesce(v_row.floor,     '')), ''),
            p_unit_door           := NULLIF(trim(coalesce(v_row.door,      '')), ''),
            p_unit_staircase      := NULLIF(trim(coalesce(v_row.staircase, '')), ''),
            p_conscription_number := NULLIF(trim(coalesce(v_row.conscriptionnumber, '')), ''),
            p_hu_hrsz             := NULLIF(trim(coalesce(v_row.conscriptionnumber, '')), ''),
            p_formatted_address   := NULLIF(trim(coalesce(v_row.display_name, '')), ''),
            p_merge_session       := p_session_id
        );

        INSERT INTO geo.source_address_link (
            master_address_id, source_provider, source_table,
            source_row_id, source_native_id, source_osm_id, source_osm_type,
            link_confidence, is_primary_source, linked_by_session
        )
        VALUES (
            v_master_address_id, 'local_osm', 'osm_addresses',
            NULL, v_row.id::text,
            v_row.osm_id, v_row.osm_type,
            1.0, true, p_session_id
        )
        ON CONFLICT (source_provider, source_native_id) DO UPDATE SET
            master_address_id = EXCLUDED.master_address_id,
            source_osm_id     = COALESCE(EXCLUDED.source_osm_id,
                                         geo.source_address_link.source_osm_id),
            linked_by_session = EXCLUDED.linked_by_session,
            updated_at        = now();

        IF v_row.lat IS NOT NULL AND v_row.lon IS NOT NULL
           AND v_coord_type IS NOT NULL THEN
            INSERT INTO geo.address_geocode (
                master_address_id, coordinate_type, geom,
                source_provider, confidence, is_primary
            )
            VALUES (
                v_master_address_id, v_coord_type,
                ST_SetSRID(ST_MakePoint(v_row.lon, v_row.lat), 4326),
                'local_osm', 1.0, true
            )
            ON CONFLICT (master_address_id, coordinate_type, source_provider) DO UPDATE SET
                geom = EXCLUDED.geom, is_primary = true, updated_at = now();
        END IF;

        v_new_addresses := v_new_addresses + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'session_id', p_session_id, 'processed', v_processed,
        'new_addresses', v_new_addresses, 'new_places', 0,
        'skipped', 0, 'last_id', v_last_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION geo.advance_backfill_job(p_job_key text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_state     geo.backfill_job_state;
    v_result    jsonb;
    v_processed integer;
BEGIN
    SELECT * INTO v_state FROM geo.backfill_job_state
    WHERE job_key = p_job_key FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
    IF v_state.status = 'done' THEN
        IF v_state.cron_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_state.cron_job_id);
            UPDATE geo.backfill_job_state SET cron_job_id=NULL,updated_at=now() WHERE job_key=p_job_key;
        END IF;
        RETURN jsonb_build_object('status','done','job_key',p_job_key);
    END IF;
    IF coalesce(v_state.source_table,'unified_pois') = 'osm_addresses' THEN
        v_result := geo.backfill_osm_addresses_chunk(
            p_after_id=>v_state.last_cursor_bigint, p_limit=>v_state.chunk_size, p_session_id=>v_state.session_id);
    ELSE
        v_result := geo.backfill_unified_pois_chunk(
            p_country_code=>v_state.country_code, p_provider=>v_state.provider,
            p_after_id=>v_state.last_cursor_id, p_limit=>v_state.chunk_size, p_session_id=>v_state.session_id);
    END IF;
    v_processed := (v_result->>'processed')::integer;
    IF v_processed = 0 THEN
        IF v_state.cron_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_state.cron_job_id); END IF;
        PERFORM geo.refresh_search_projection();
        UPDATE geo.backfill_job_state SET status='done',cron_job_id=NULL,finished_at=now(),updated_at=now() WHERE job_key=p_job_key;
        RETURN jsonb_build_object('status','done','total_processed',v_state.total_processed,'search_refreshed',true);
    END IF;
    UPDATE geo.backfill_job_state SET
        last_cursor_bigint = CASE WHEN coalesce(v_state.source_table,'unified_pois')='osm_addresses'
            THEN (v_result->>'last_id')::bigint ELSE last_cursor_bigint END,
        last_cursor_id = CASE WHEN coalesce(v_state.source_table,'unified_pois')!='osm_addresses'
            THEN (v_result->>'last_id')::uuid ELSE last_cursor_id END,
        total_processed=total_processed+v_processed,
        total_addresses=total_addresses+coalesce((v_result->>'new_addresses')::integer,0),
        total_places=total_places+coalesce((v_result->>'new_places')::integer,0),
        total_skipped=total_skipped+coalesce((v_result->>'skipped')::integer,0),
        iterations=iterations+1, status='running', updated_at=now()
    WHERE job_key=p_job_key;
    RETURN jsonb_build_object('status','running','processed',v_processed,'last_cursor',(v_result->>'last_id'));
END;
$$;

DROP FUNCTION IF EXISTS geo.start_backfill_job(text,text,text,integer);

CREATE OR REPLACE FUNCTION geo.start_backfill_job(
    p_job_key      text    DEFAULT 'default',
    p_country_code text    DEFAULT NULL,
    p_provider     text    DEFAULT NULL,
    p_chunk_size   integer DEFAULT 1000,
    p_source_table text    DEFAULT 'unified_pois'
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_cron_id bigint;
BEGIN
    INSERT INTO geo.backfill_job_state (
        job_key,country_code,provider,chunk_size,source_table,
        status,session_id,last_cursor_id,last_cursor_bigint,
        total_processed,total_addresses,total_places,total_skipped,iterations,started_at)
    VALUES (p_job_key,p_country_code,p_provider,p_chunk_size,p_source_table,
        'pending',gen_random_uuid(),NULL,NULL,0,0,0,0,0,now())
    ON CONFLICT (job_key) DO UPDATE SET
        country_code=EXCLUDED.country_code,provider=EXCLUDED.provider,
        chunk_size=EXCLUDED.chunk_size,source_table=EXCLUDED.source_table,
        status='pending',session_id=gen_random_uuid(),
        last_cursor_id=NULL,last_cursor_bigint=NULL,
        total_processed=0,total_addresses=0,total_places=0,total_skipped=0,iterations=0,
        last_error=NULL,finished_at=NULL,started_at=now(),updated_at=now();
    v_cron_id := cron.schedule('geo_backfill_'||p_job_key,'* * * * *',
        format('SELECT geo.advance_backfill_job(%L)',p_job_key));
    UPDATE geo.backfill_job_state SET cron_job_id=v_cron_id,status='running',updated_at=now() WHERE job_key=p_job_key;
    RETURN jsonb_build_object('job_key',p_job_key,'source_table',p_source_table,
        'cron_job_id',v_cron_id,'chunk_size',p_chunk_size,'status','running',
        'monitor','SELECT job_key,source_table,status,total_processed,total_addresses,iterations,updated_at FROM geo.backfill_job_state;');
END;
$$;
