-- 0009_cron.sql
-- Scheduled jobs. pg_cron ticks; pg_net makes the HTTP call to the Edge Function.
--
-- Environment-aware by construction: the project URL and service-role key are read from
-- Vault at RUN time, not baked into this migration. The identical file therefore applies
-- to local, staging and prod — only the Vault contents differ.
--
-- Setting the secrets (once per environment):
--   select vault.create_secret('http://host.docker.internal:54321', 'project_url');
--   select vault.create_secret('<service-role-key>',                'service_role_key');
--
-- Until those exist the jobs are still registered but each call is a no-op that raises a
-- notice, so `supabase db reset` on a fresh machine stays clean and non-fatal.

-- Reads a Vault secret, returning null (not raising) when Vault or the secret is absent.
create or replace function app.vault_secret(p_name text) returns text
language plpgsql security definer stable set search_path = public as $$
declare v_value text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
     into v_value using p_name;
  return v_value;
exception when others then
  return null;
end $$;

-- Single entry point for every cron-driven Edge Function call.
create or replace function app.invoke_edge_function(p_name text, p_body jsonb default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := app.vault_secret('project_url');
  v_key text := app.vault_secret('service_role_key');
begin
  if v_url is null or v_key is null then
    raise notice 'app.invoke_edge_function(%): vault secrets not configured, skipping', p_name;
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'),
    body    := p_body,
    timeout_milliseconds := 20000
  );
end $$;

revoke all on function app.vault_secret(text), app.invoke_edge_function(text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
-- Re-running this migration must not create duplicate jobs, so unschedule first.
-- Minute granularity is ample: the smallest prediction buffer is 10 minutes.

do $$
declare
  v_job record;
begin
  for v_job in
    select * from (values
      ('dispatch-notifications', '* * * * *',
       $q$select app.invoke_edge_function('dispatch-notifications')$q$),
      ('check-push-receipts',    '*/15 * * * *',
       $q$select app.invoke_edge_function('check-receipts')$q$),
      ('recalibrate-holds',      '30 3 * * *',
       $q$select app.invoke_edge_function('recalibrate')$q$),
      ('prune-rate-limits',      '0 4 * * *',
       $q$select app.prune_rate_limits()$q$)
    ) as t(jobname, schedule, command)
  loop
    if exists (select 1 from cron.job where jobname = v_job.jobname) then
      perform cron.unschedule(v_job.jobname);
    end if;
    perform cron.schedule(v_job.jobname, v_job.schedule, v_job.command);
  end loop;
end $$;
