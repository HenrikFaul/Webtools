-- Migration: geo_canonical_15_run_full_backfill
-- Teljesen automatikus, önállóan leálló backfill loop.
-- Elindítás: SET statement_timeout = 0; SELECT geo.run_full_backfill();

CREATE OR REPLACE FUNCTION geo.run_full_backfill(
    p_country_code  text    DEFAULT NULL,   -- NULL = minden ország
    p_provider      text    DEFAULT NULL,   -- NULL = minden provider
    p_chunk_size    integer DEFAULT 500,    -- sorok száma chunk-onként
    p_refresh       boolean DEFAULT true,   -- frissítse-e a search_projection-t a végén
    p_verbose       boolean DEFAULT false   -- írjon-e részletes logot a NOTICE-ba
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_session_id        uuid := gen_random_uuid();
    v_after_id          uuid := NULL;
    v_chunk_result      jsonb;
    v_processed         integer;
    v_iteration         integer := 0;
    v_total_processed   integer := 0;
    v_total_addresses   integer := 0;
    v_total_places      integer := 0;
    v_total_skipped     integer := 0;
    v_started_at        timestamptz := now();
    v_elapsed_ms        bigint;
BEGIN
    IF p_verbose THEN
        RAISE NOTICE '[geo.run_full_backfill] session=% country=% provider=% chunk=%',
            v_session_id, p_country_code, p_provider, p_chunk_size;
    END IF;

    -- ---- BACKFILL LOOP ----
    LOOP
        v_iteration := v_iteration + 1;

        v_chunk_result := geo.backfill_unified_pois_chunk(
            p_country_code => p_country_code,
            p_provider     => p_provider,
            p_after_id     => v_after_id,
            p_limit        => p_chunk_size,
            p_session_id   => v_session_id
        );

        v_processed := (v_chunk_result->>'processed')::integer;

        EXIT WHEN v_processed = 0;

        v_total_processed := v_total_processed + v_processed;
        v_total_addresses := v_total_addresses + (v_chunk_result->>'new_addresses')::integer;
        v_total_places    := v_total_places    + (v_chunk_result->>'new_places')::integer;
        v_total_skipped   := v_total_skipped   + (v_chunk_result->>'skipped')::integer;

        v_after_id := (v_chunk_result->>'last_id')::uuid;

        IF p_verbose THEN
            RAISE NOTICE '[geo.run_full_backfill] iter=% processed=% cumulative=% last_id=%',
                v_iteration, v_processed, v_total_processed, v_after_id;
        END IF;

    END LOOP;

    -- ---- SEARCH PROJECTION FRISSÍTÉSE ----
    IF p_refresh AND v_total_processed > 0 THEN
        IF p_verbose THEN
            RAISE NOTICE '[geo.run_full_backfill] Refreshing search_projection (CONCURRENTLY)...';
        END IF;
        PERFORM geo.refresh_search_projection();
    END IF;

    v_elapsed_ms := EXTRACT(EPOCH FROM (now() - v_started_at)) * 1000;

    RETURN jsonb_build_object(
        'session_id',                   v_session_id,
        'status',                       'done',
        'iterations',                   v_iteration - 1,
        'total_processed',              v_total_processed,
        'total_new_addresses',          v_total_addresses,
        'total_new_places',             v_total_places,
        'total_skipped',                v_total_skipped,
        'search_projection_refreshed',  (p_refresh AND v_total_processed > 0),
        'elapsed_ms',                   v_elapsed_ms,
        'country_code',                 p_country_code,
        'provider',                     p_provider,
        'chunk_size',                   p_chunk_size,
        'finished_at',                  now()
    );
END;
$$;

COMMENT ON FUNCTION geo.run_full_backfill IS
  'Teljesen automatikus, önállóan leálló backfill loop. '
  'Chunkonként hívja geo.backfill_unified_pois_chunk() az utolsó last_id kurzoron haladva, '
  'amíg processed=0. Végül CONCURRENTLY frissíti a search_projection-t. '
  'Elindítás: SET statement_timeout = 0; SELECT geo.run_full_backfill(); '
  'Részletes napló: SELECT geo.run_full_backfill(p_verbose => true); '
  'Csak HU: SELECT geo.run_full_backfill(p_country_code => ''HU''); '
  'Refresh nélkül: SELECT geo.run_full_backfill(p_refresh => false);';
