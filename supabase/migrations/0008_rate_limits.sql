-- 0008_rate_limits.sql
-- Fixed-window rate limiting, in Postgres so that both RPCs and Edge Functions share one
-- counter (an in-memory limiter inside a function instance would reset on every cold start).
--
-- Lives in `app`, so it is not reachable over the API and a client cannot clear its own
-- counters.

create table app.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

-- Raises RATE_LIMITED when p_key exceeds p_limit hits inside p_window.
-- The upsert is atomic: concurrent callers serialise on the primary key, so two requests
-- racing at the boundary cannot both slip through.
create or replace function app.check_rate_limit(
  p_key    text,
  p_limit  int,
  p_window interval
) returns void
language plpgsql security definer set search_path = app, public as $$
declare v_count int;
begin
  insert into app.rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
     set count = case
           -- Window elapsed: start a fresh one.
           when app.rate_limits.window_start < now() - p_window then 1
           else app.rate_limits.count + 1
         end,
         window_start = case
           when app.rate_limits.window_start < now() - p_window then now()
           else app.rate_limits.window_start
         end
  returning count into v_count;

  if v_count > p_limit then
    raise exception 'RATE_LIMITED: % (limit % per %)', p_key, p_limit, p_window
      using errcode = 'P0001';
  end if;
end $$;

-- Housekeeping: drop counters whose window closed long ago. Scheduled in 0009.
create or replace function app.prune_rate_limits() returns void
language sql security definer set search_path = app, public as $$
  delete from app.rate_limits where window_start < now() - interval '2 days';
$$;

revoke all on function app.check_rate_limit(text, int, interval) from public, anon, authenticated;
grant execute on function app.check_rate_limit(text, int, interval) to service_role;
