-- 001_rls_isolation.sql
-- The security wall: a member of one household must never see or touch another's data.
-- Every failure here is a data-leak bug, so this is the suite that matters most.
--
-- Results are collected into a temp table rather than streamed, because the Management
-- API only returns the final result set — a bare `select ok(...)` run would report a
-- failure count with no indication of WHICH test failed. The last statement selects the
-- failing lines, so a red run names its own culprit.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
-- Tests execute while impersonating `authenticated`, so that role has to be able to
-- write the collector too — otherwise the first insert dies on the temp table itself.
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;

-- pgTAP refuses to run a test without a plan. no_plan() avoids hardcoding a count that
-- has to be edited every time a test is added — the report at the bottom is what we read.
select * from no_plan();

select tests.seed_fixtures();

-- ---------------------------------------------------------------------------
-- RLS is actually switched on
-- ---------------------------------------------------------------------------

insert into _tap(line) select ok(
  (select bool_and(rowsecurity) from pg_tables
    where schemaname = 'public'
      and tablename in ('profiles','households','household_members','household_invites',
                        'pets','feed_times','medications','logs','appointments',
                        'appointment_pets','appointment_reminders','notification_tokens',
                        'notifications','prediction_state')),
  'RLS is enabled on all 14 public tables'
);

-- ---------------------------------------------------------------------------
-- Alice (household A) sees only household A
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select count(*)::int from public.households), 1,
  'alice sees exactly one household');
insert into _tap(line) select is(
  (select id from public.households), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'and it is her own');
insert into _tap(line) select is(
  (select count(*)::int from public.pets), 1,
  'alice sees only her household''s pet');
insert into _tap(line) select is(
  (select name from public.pets), 'Rex', 'and it is Rex, not Milo');
insert into _tap(line) select is(
  (select count(*)::int from public.pets where id = 'dddddddd-0000-0000-0000-0000000000b1'), 0,
  'household B''s pet is invisible even when addressed by id');
insert into _tap(line) select is(
  (select count(*)::int from public.feed_times), 1,
  'feed_times are scoped through the parent pet');

-- ---------------------------------------------------------------------------
-- Carol (household B) sees only household B — the mirror image
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');

insert into _tap(line) select is(
  (select count(*)::int from public.households), 1, 'carol sees one household');
insert into _tap(line) select is(
  (select name from public.pets), 'Milo', 'carol sees Milo, not Rex');

-- ---------------------------------------------------------------------------
-- Cross-household WRITES are refused
-- ---------------------------------------------------------------------------
-- An INSERT failing WITH CHECK raises 42501; an UPDATE/DELETE failing USING silently
-- affects zero rows. Both are covered, because only the first one throws.

insert into _tap(line) select throws_ok(
  $$ insert into public.pets (household_id, name, species)
     values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Trojan', 'dog') $$,
  '42501', null, 'carol cannot insert a pet into household A');

insert into _tap(line) select lives_ok(
  $$ update public.pets set name = 'Pwned'
      where id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'cross-household update runs without error (USING filters rows, does not throw)');

select tests.become_service();
insert into _tap(line) select is(
  (select name from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'), 'Rex',
  'but Rex was NOT renamed — zero rows matched');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
insert into _tap(line) select lives_ok(
  $$ delete from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'cross-household delete runs without error');

select tests.become_service();
insert into _tap(line) select is(
  (select count(*)::int from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'), 1,
  'but Rex still exists');

-- ---------------------------------------------------------------------------
-- Logs: household_id / pet_id consistency, and no forging authorship
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select lives_ok(
  $$ insert into public.logs (id, household_id, pet_id, type, created_by)
     values ('11111111-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-0000000000a1',
             'dddddddd-0000-0000-0000-0000000000a1', 'pee',
             'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'alice can log for her own pet');

insert into _tap(line) select throws_ok(
  $$ insert into public.logs (id, household_id, pet_id, type, created_by)
     values ('11111111-0000-0000-0000-000000000002',
             'aaaaaaaa-0000-0000-0000-0000000000a1',
             'dddddddd-0000-0000-0000-0000000000b1', 'pee',
             'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'alice cannot attach household B''s pet to a household A log');

insert into _tap(line) select throws_ok(
  $$ insert into public.logs (id, household_id, pet_id, type, created_by)
     values ('11111111-0000-0000-0000-000000000003',
             'aaaaaaaa-0000-0000-0000-0000000000a1',
             'dddddddd-0000-0000-0000-0000000000a1', 'pee',
             'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'alice cannot forge a log as bob (created_by must be the caller)');

-- ---------------------------------------------------------------------------
-- Membership cannot be self-granted
-- ---------------------------------------------------------------------------
-- There is deliberately no INSERT policy on household_members — this is the hole that
-- would otherwise let anyone who learned a household id add themselves to it.

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
insert into _tap(line) select throws_ok(
  $$ insert into public.household_members (household_id, user_id, role)
     values ('aaaaaaaa-0000-0000-0000-0000000000a1',
             'aaaaaaaa-0000-0000-0000-000000000003', 'member') $$,
  '42501', null, 'carol cannot insert herself into household A');

-- ---------------------------------------------------------------------------
-- Push tokens are private to their owner, not shared with the household
-- ---------------------------------------------------------------------------

select tests.become_service();
insert into public.notification_tokens (user_id, device_id, expo_push_token, platform)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'dev-alice', 'ExponentPushToken[alice]', 'ios');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');
insert into _tap(line) select is(
  (select count(*)::int from public.notification_tokens), 0,
  'bob cannot see alice''s push token even though they share a household');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _tap(line) select is(
  (select count(*)::int from public.notification_tokens), 1,
  'alice can see her own push token');

-- ---------------------------------------------------------------------------
-- notifications / prediction_state are read-only to clients
-- ---------------------------------------------------------------------------

insert into _tap(line) select throws_ok(
  $$ insert into public.notifications
       (household_id, kind, dedupe_key, title, body, scheduled_for)
     values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'break_prediction',
             'forged:1', 'x', 'y', now()) $$,
  '42501', null,
  'a client cannot forge a notification row (idempotency spine is service-role only)');

-- Note the assertion is a hard 42501, not a silent zero-row update. RLS alone would give
-- the quiet version (no UPDATE policy => no rows qualify); 0010 revokes the table grant so
-- the attempt fails loudly instead. See that migration for why the distinction matters.
insert into _tap(line) select throws_ok(
  $$ update public.prediction_state set notify_at = now()
      where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'a client cannot rewrite prediction_state');

-- ---------------------------------------------------------------------------
-- Signed-out callers are refused outright
-- ---------------------------------------------------------------------------
-- Anonymous *sign-in* yields a real user with the `authenticated` role, so nothing is
-- ever served to `anon`. 0010 revokes its table grants, so these fail at the grant layer
-- rather than quietly returning zero rows.

select tests.logout();
insert into _tap(line) select throws_ok(
  $$ select count(*) from public.households $$, '42501', null,
  'anon cannot read households at all');
insert into _tap(line) select throws_ok(
  $$ select count(*) from public.pets $$, '42501', null,
  'anon cannot read pets at all');
insert into _tap(line) select throws_ok(
  $$ select count(*) from public.logs $$, '42501', null,
  'anon cannot read logs at all');

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select tests.become_service();

select
  (select count(*) from _tap)                                  as tests_run,
  (select count(*) from _tap where line like 'not ok%')         as failed,
  coalesce((select string_agg(line, ' | ' order by seq)
              from _tap where line like 'not ok%'), 'ALL PASS') as failures;

rollback;
