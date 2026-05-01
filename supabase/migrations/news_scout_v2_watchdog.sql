-- News Scout v2: watchdog, heartbeat, progress columns
-- Apply AFTER news_scout_tables.sql in Supabase SQL Editor (geodata project)

-- ── Extend news_scan_runs ──────────────────────────────────────────────────
alter table public.news_scan_runs
  add column if not exists last_heartbeat_at  timestamptz,
  add column if not exists progress_processed integer not null default 0,
  add column if not exists progress_total     integer not null default 0,
  add column if not exists cancelled_at       timestamptz,
  add column if not exists error_message      text;

-- ── Extend news_scout_config ───────────────────────────────────────────────
alter table public.news_scout_config
  add column if not exists watchdog_timeout_minutes integer not null default 15
    constraint news_scout_config_watchdog_chk check (watchdog_timeout_minutes between 1 and 1440),
  add column if not exists max_concurrent_runs      integer not null default 1
    constraint news_scout_config_concurrent_chk check (max_concurrent_runs between 1 and 10);

-- ── Indexes for watchdog query ─────────────────────────────────────────────
create index if not exists idx_news_scan_runs_active
  on public.news_scan_runs (status)
  where status in ('queued', 'running');

create index if not exists idx_news_scan_runs_heartbeat
  on public.news_scan_runs (last_heartbeat_at)
  where status in ('queued', 'running');

-- ── Watchdog function ──────────────────────────────────────────────────────
-- Marks stuck runs as 'failed'. Returns the number of runs killed.
-- A run is "stuck" when:
--   status = 'queued'   AND started_at       < now() - timeout
--   status = 'running'  AND last_heartbeat_at < now() - timeout
--                           (or no heartbeat at all and started_at < now() - timeout)
create or replace function public.news_scout_watchdog(p_timeout_minutes integer default 15)
returns table (
  killed_run_id uuid,
  was_status    text,
  reason        text
)
language plpgsql
as $$
begin
  return query
  with victims as (
    select
      run_id,
      status,
      case
        when status = 'queued' then
          'Queued de ' || p_timeout_minutes || ' perce nem indult el'
        when status = 'running' and last_heartbeat_at is null then
          'Running de soha nem érkezett heartbeat, ' || p_timeout_minutes || ' perc után'
        else
          'Running de utolsó heartbeat ' || p_timeout_minutes || ' perce volt'
      end as kill_reason
    from public.news_scan_runs
    where status in ('queued', 'running')
      and (
        (status = 'queued'  and started_at        < now() - (p_timeout_minutes || ' minutes')::interval)
     or (status = 'running' and coalesce(last_heartbeat_at, started_at) < now() - (p_timeout_minutes || ' minutes')::interval)
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
