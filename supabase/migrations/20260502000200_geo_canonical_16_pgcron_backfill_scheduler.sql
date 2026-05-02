-- Migration: geo_canonical_16_pgcron_backfill_scheduler
-- Megoldja: Supabase SQL editor ~30s HTTP timeout nem teszi lehetővé a run_full_backfill() hívást.
-- Megoldás: pg_cron alapú önütemező backfill cursor state táblával.
-- A job percenként fut, leállítja magát ha nincs több sor.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS geo.backfill_job_state (
    job_key         text PRIMARY KEY,
    country_code    text,
    provider        text,
    chunk_size      integer DEFAULT 200,
    last_cursor_id  uuid,
    session_id      uuid NOT NULL DEFAULT gen_random_uuid(),
    total_processed integer DEFAULT 0,
    total_addresses integer DEFAULT 0,
    total_places    integer DEFAULT 0,
    total_skipped   integer DEFAULT 0,
    iterations      integer DEFAULT 0,
    status          text NOT NULL DEFAULT 'pending',
    cron_job_id     bigint,
    last_error      text,
    started_at      timestamptz DEFAULT now(),
    finished_at     timestamptz,
    updated_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE geo.backfill_job_state IS
  'Cursor state a cron-alapú backfill jobhoz. Egy sor per job_key.';

CREATE OR REPLACE FUNCTION geo.advance_backfill_job(p_job_key text)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_state     geo.backfill_job_state;
    v_result    jsonb;
    v_processed integer;
BEGIN
    SELECT * INTO v_state
    FROM geo.backfill_job_state
    WHERE job_key = p_job_key
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'job_key', p_job_key);
    END IF;

    IF v_state.status = 'done' THEN
        IF v_state.cron_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_state.cron_job_id);
            UPDATE geo.backfill_job_state
            SET cron_job_id = NULL, updated_at = now()
            WHERE job_key = p_job_key;
        END IF;
        RETURN jsonb_build_object('status', 'done', 'job_key', p_job_key);
    END IF;

    v_result := geo.backfill_unified_pois_chunk(
        p_country_code => v_state.country_code,
        p_provider     => v_state.provider,
        p_after_id     => v_state.last_cursor_id,
        p_limit        => v_state.chunk_size,
        p_session_id   => v_state.session_id
    );

    v_processed := (v_result->>'processed')::integer;

    IF v_processed = 0 THEN
        IF v_state.cron_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_state.cron_job_id);
        END IF;
        PERFORM geo.refresh_search_projection();
        UPDATE geo.backfill_job_state SET
            status      = 'done',
            cron_job_id = NULL,
            finished_at = now(),
            updated_at  = now()
        WHERE job_key = p_job_key;
        RETURN jsonb_build_object(
            'status',          'done',
            'job_key',         p_job_key,
            'total_processed', v_state.total_processed,
            'search_refreshed', true
        );
    END IF;

    UPDATE geo.backfill_job_state SET
        last_cursor_id  = (v_result->>'last_id')::uuid,
        total_processed = total_processed + (v_result->>'processed')::integer,
        total_addresses = total_addresses + (v_result->>'new_addresses')::integer,
        total_places    = total_places    + (v_result->>'new_places')::integer,
        total_skipped   = total_skipped   + (v_result->>'skipped')::integer,
        iterations      = iterations + 1,
        status          = 'running',
        updated_at      = now()
    WHERE job_key = p_job_key;

    RETURN jsonb_build_object(
        'status',    'running',
        'processed', v_processed,
        'last_cursor', (v_result->>'last_id')
    );
END;
$$;

CREATE OR REPLACE FUNCTION geo.start_backfill_job(
    p_job_key       text    DEFAULT 'default',
    p_country_code  text    DEFAULT NULL,
    p_provider      text    DEFAULT NULL,
    p_chunk_size    integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_cron_id   bigint;
BEGIN
    INSERT INTO geo.backfill_job_state
        (job_key, country_code, provider, chunk_size, status, session_id,
         last_cursor_id, total_processed, total_addresses, total_places,
         total_skipped, iterations, started_at)
    VALUES
        (p_job_key, p_country_code, p_provider, p_chunk_size, 'pending',
         gen_random_uuid(), NULL, 0, 0, 0, 0, 0, now())
    ON CONFLICT (job_key) DO UPDATE SET
        country_code    = EXCLUDED.country_code,
        provider        = EXCLUDED.provider,
        chunk_size      = EXCLUDED.chunk_size,
        status          = 'pending',
        session_id      = gen_random_uuid(),
        last_cursor_id  = NULL,
        total_processed = 0,
        total_addresses = 0,
        total_places    = 0,
        total_skipped   = 0,
        iterations      = 0,
        last_error      = NULL,
        finished_at     = NULL,
        started_at      = now(),
        updated_at      = now();

    v_cron_id := cron.schedule(
        'geo_backfill_' || p_job_key,
        '* * * * *',
        format('SELECT geo.advance_backfill_job(%L)', p_job_key)
    );

    UPDATE geo.backfill_job_state
    SET cron_job_id = v_cron_id, status = 'running', updated_at = now()
    WHERE job_key = p_job_key;

    RETURN jsonb_build_object(
        'job_key',      p_job_key,
        'cron_job_id',  v_cron_id,
        'chunk_size',   p_chunk_size,
        'country_code', p_country_code,
        'status',       'running',
        'monitor',      'SELECT job_key,status,total_processed,total_addresses,iterations,updated_at FROM geo.backfill_job_state;'
    );
END;
$$;

CREATE OR REPLACE FUNCTION geo.stop_backfill_job(p_job_key text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v_state geo.backfill_job_state;
BEGIN
    SELECT * INTO v_state FROM geo.backfill_job_state WHERE job_key = p_job_key;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'job not found'); END IF;
    IF v_state.cron_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_state.cron_job_id);
    END IF;
    UPDATE geo.backfill_job_state
    SET status = 'stopped', cron_job_id = NULL, updated_at = now()
    WHERE job_key = p_job_key;
    RETURN jsonb_build_object('job_key', p_job_key, 'status', 'stopped',
                               'total_processed', v_state.total_processed);
END;
$$;

COMMENT ON FUNCTION geo.start_backfill_job IS
  'pg_cron alapú backfill indítása. Percenként fut, automatikusan leáll ha végzett. '
  'Indítás:   SELECT geo.start_backfill_job(); '
  'Állapot:   SELECT job_key,status,total_processed,iterations,updated_at FROM geo.backfill_job_state; '
  'Leállítás: SELECT geo.stop_backfill_job();';
