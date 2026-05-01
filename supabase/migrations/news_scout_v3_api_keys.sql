-- News Scout v3: API keys storage + improved watchdog for queued-never-started runs
-- Apply AFTER news_scout_v2_watchdog.sql in Supabase SQL Editor (geodata project)

-- ── API keys column ────────────────────────────────────────────────────────────
alter table public.news_scout_config
  add column if not exists api_keys jsonb not null default '{}';

-- ── Improved watchdog function ─────────────────────────────────────────────────
-- Adds special handling for queued runs that never received any heartbeat:
--   kills them after LEAST(5, p_timeout_minutes) minutes instead of the full timeout.
-- This prevents stuck "queued" runs (e.g. when n8n is not connected) from sitting forever.
create or replace function public.news_scout_watchdog(p_timeout_minutes integer default 15)
returns table (
  killed_run_id uuid,
  was_status    text,
  reason        text
)
language plpgsql
as $$
declare
  v_never_started_minutes integer := least(5, p_timeout_minutes);
begin
  return query
  with victims as (
    select
      run_id,
      status,
      case
        when status = 'queued' and last_heartbeat_at is null then
          'Queued, de soha nem indult el (nem érkezett heartbeat ' || v_never_started_minutes || ' perc alatt)'
        when status = 'running' and last_heartbeat_at is null then
          'Running, de soha nem érkezett heartbeat (' || p_timeout_minutes || ' perc timeout)'
        else
          'Utolsó heartbeat ' ||
          round(extract(epoch from (now() - coalesce(last_heartbeat_at, started_at))) / 60)::integer ||
          ' perce volt (küszöb: ' || p_timeout_minutes || ' perc)'
      end as kill_reason
    from public.news_scan_runs
    where status in ('queued', 'running')
      and (
        -- Queued with no heartbeat ever: kill after v_never_started_minutes
        (status = 'queued'
         and last_heartbeat_at is null
         and started_at < now() - (v_never_started_minutes || ' minutes')::interval)
        or
        -- Running or queued with heartbeat: kill after p_timeout_minutes of silence
        (coalesce(last_heartbeat_at, started_at) < now() - (p_timeout_minutes || ' minutes')::interval)
      )
  ),
  killed as (
    update public.news_scan_runs r
    set
      status        = 'failed',
      finished_at   = now(),
      cancelled_at  = now(),
      error_message = v.kill_reason
    from victims v
    where r.run_id = v.run_id
    returning r.run_id, v.kill_reason, v.status
  )
  select killed.run_id, killed.status, killed.kill_reason
  from killed;
end;
$$;
