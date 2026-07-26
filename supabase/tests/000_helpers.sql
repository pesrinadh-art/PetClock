-- 000_helpers.sql — shared fixtures and impersonation helpers for the pgTAP suites.
--
-- Run order matters only in that this file must be applied before the suites; it creates
-- functions in `tests`, which is dropped and recreated on each run.
--
-- Local:   supabase test db
-- Hosted:  psql "$DB_URL" -f supabase/tests/000_helpers.sql -f supabase/tests/00N_*.sql

create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;

-- ---------------------------------------------------------------------------
-- Impersonation
-- ---------------------------------------------------------------------------
-- RLS policies call auth.uid(), which reads the `sub` claim out of the
-- request.jwt.claims GUC. Setting that GUC is how we pretend to be a signed-in user
-- inside a test transaction.

-- Each helper RESETs first. Once the session is running as `authenticated`, it cannot
-- SET ROLE to postgres or anon (it is not a member of either) — but RESET ROLE always
-- returns to the session's login role, so every switch has to route back through it.
create or replace function tests.authenticate_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user_id::text,
                                       'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end $$;

-- Drop back to an unauthenticated caller.
create or replace function tests.logout() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
end $$;

-- Return to the owning role so fixtures can be created regardless of RLS.
create or replace function tests.become_service() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- Two households that must never see each other, which is the property most of the RLS
-- suite exists to prove:
--
--   Household A (aaaa…a1)   owner alice (aaaa…01), member bob (aaaa…02)
--     pet  Rex   (dddd…a1), feed time 08:00, hold 4h/6h
--   Household B (aaaa…b1)   owner carol (aaaa…03)
--     pet  Milo  (dddd…b1)
--
-- Users are inserted into auth.users, so app.handle_new_user() creates their profiles.

create or replace function tests.seed_fixtures() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, 'x', now(), now(), now(), '{}', json_build_object('name', u.nm)::jsonb,
         '', '', '', ''
    from (values
      ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'alice@test.local', 'Alice'),
      ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'bob@test.local',   'Bob'),
      ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'carol@test.local', 'Carol')
    ) as u(id, email, nm)
  on conflict (id) do nothing;

  insert into public.households (id, name, timezone, created_by) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'House A', 'America/Los_Angeles',
     'aaaaaaaa-0000-0000-0000-000000000001'),
    ('aaaaaaaa-0000-0000-0000-0000000000b1', 'House B', 'America/New_York',
     'aaaaaaaa-0000-0000-0000-000000000003')
  on conflict (id) do nothing;

  insert into public.household_members (household_id, user_id, role) values
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
    ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000002', 'member'),
    ('aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000003', 'owner')
  on conflict do nothing;

  insert into public.pets (id, household_id, name, species, pee_hold_hours, poop_hold_hours) values
    ('dddddddd-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1',
     'Rex', 'dog', 4, 6),
    ('dddddddd-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-0000000000b1',
     'Milo', 'cat', 4, 6)
  on conflict (id) do nothing;

  -- Rex gets a feed time: app.recompute_prediction requires one (it mirrors hasSchedule()).
  insert into public.feed_times (pet_id, local_time, active) values
    ('dddddddd-0000-0000-0000-0000000000a1', '08:00', true),
    ('dddddddd-0000-0000-0000-0000000000b1', '08:00', true)
  on conflict do nothing;
end $$;

-- The suites call these helpers *while impersonating* `authenticated`, so that role needs
-- reach into the schema. Without this the first authenticate_as() succeeds and every
-- subsequent tests.* call fails with "permission denied for schema tests".
grant usage on schema tests to public, anon, authenticated, service_role;
grant execute on all functions in schema tests to public, anon, authenticated, service_role;
