-- 0001_extensions.sql
-- Extensions and the internal `app` schema.
--
-- Everything the frontend is allowed to touch lives in `public` (PostgREST exposes it,
-- RLS guards it). `app` holds SECURITY DEFINER helpers and internal state that must NOT
-- be reachable over the API — so its usage grant is revoked from the API roles below.

create extension if not exists pg_cron  with schema pg_catalog;
create extension if not exists pg_net   with schema extensions;
create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid()

create schema if not exists app;

-- `app` is internal-only: never exposed via PostgREST, never callable by a client JWT.
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to postgres, service_role;

-- pg_cron lives in pg_catalog; only the superuser/postgres role schedules jobs.
grant usage on schema cron to postgres;
