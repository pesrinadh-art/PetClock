-- 012_care_pushes.sql
-- Phase 3 server pushes for walks and habitat cleaning (0022_care_pushes.sql,
-- docs/CARE_MODULES_PLAN.md "0022+ (Phase 3)").
--
-- Part 1 is GENERATED from shared/fixtures/care_vectors.json by scripts/gen-care-parity-sql.js:
-- the same inputs lib/__tests__/careVectors.test.ts runs through the client's predictWalk /
-- habitatDue, asserted here against app.recompute_care. Every instant is absolute (neither due
-- time depends on now()), so those assertions are exact. jest fails when the block is stale.
--
-- Part 2 is hand-written: gating (module off deletes state and supersedes pushes), dedupe
-- exactly-once, dispatch bookkeeping never rolls a due time forward, snooze re-ask, the
-- log-action "Done" path, RLS (walkers cannot write), the care_due kind, and the app-version gate.
--
-- Run (after 000_helpers.sql):
--   supabase db query --linked -f supabase/tests/012_care_pushes.sql

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- Fixture ids (000_helpers.sql):
--   household A aaaaaaaa-…-a1 (America/Los_Angeles): alice owner …01, bob member …02
--   household B aaaaaaaa-…-b1: carol owner …03
--   Rex dddddddd-…-a1 (dog, 4h/6h, feed 08:00)   Milo dddddddd-…-b1 (household B)

-- ===========================================================================
-- Part 1 — client/server parity (generated)
-- ===========================================================================

-- BEGIN GENERATED care vectors (scripts/gen-care-parity-sql.js) — do not edit by hand

-- ---------------------------------------------------------------------------
-- w01_default_interval
-- Walk interval unset -> 4h default. Buffer round(4*60*0.10)=24 clamps to 20 min.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000001', 'Care w01_default_interval', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000001', '01200000-0000-0000-0000-000000000001', 'C1', 'other', '{walks,meals}', null, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000001', '01200000-0000-0000-0001-000000000001', 'walk', '2026-06-15T14:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000001', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000001' and module = 'walks'),
  1, 'w01_default_interval: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000001' and module = 'walks'),
  '2026-06-15T14:00:00.000Z'::timestamptz, 'w01_default_interval: anchor is the latest live log (2026-06-15T14:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000001' and module = 'walks'),
  '2026-06-15T18:00:00.000Z'::timestamptz, 'w01_default_interval: due_at = 2026-06-15T18:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000001' and module = 'walks'),
  '2026-06-15T17:40:00.000Z'::timestamptz, 'w01_default_interval: notify_at = 2026-06-15T17:40:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000001' and module = 'walks'),
  20, 'w01_default_interval: buffer is 20 min');

-- ---------------------------------------------------------------------------
-- w02_half_hour_min_buffer
-- 0.5h interval: buffer round(3)=3 clamps up to the 5 min floor.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000002', 'Care w02_half_hour_min_buffer', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000002', '01200000-0000-0000-0000-000000000002', 'C2', 'other', '{walks,meals}', 0.5, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000002', '01200000-0000-0000-0001-000000000002', 'walk', '2026-06-15T14:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000002', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000002' and module = 'walks'),
  1, 'w02_half_hour_min_buffer: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000002' and module = 'walks'),
  '2026-06-15T14:00:00.000Z'::timestamptz, 'w02_half_hour_min_buffer: anchor is the latest live log (2026-06-15T14:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000002' and module = 'walks'),
  '2026-06-15T14:30:00.000Z'::timestamptz, 'w02_half_hour_min_buffer: due_at = 2026-06-15T14:30:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000002' and module = 'walks'),
  '2026-06-15T14:25:00.000Z'::timestamptz, 'w02_half_hour_min_buffer: notify_at = 2026-06-15T14:25:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000002' and module = 'walks'),
  5, 'w02_half_hour_min_buffer: buffer is 5 min');

-- ---------------------------------------------------------------------------
-- w03_fractional_interval
-- 1.5h interval: buffer round(9)=9 min, inside the clamp.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000003', 'Care w03_fractional_interval', 'Europe/London');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000003', '01200000-0000-0000-0000-000000000003', 'C3', 'other', '{walks,meals}', 1.5, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000003', '01200000-0000-0000-0001-000000000003', 'walk', '2026-06-15T14:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000003', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000003' and module = 'walks'),
  1, 'w03_fractional_interval: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000003' and module = 'walks'),
  '2026-06-15T14:00:00.000Z'::timestamptz, 'w03_fractional_interval: anchor is the latest live log (2026-06-15T14:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000003' and module = 'walks'),
  '2026-06-15T15:30:00.000Z'::timestamptz, 'w03_fractional_interval: due_at = 2026-06-15T15:30:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000003' and module = 'walks'),
  '2026-06-15T15:21:00.000Z'::timestamptz, 'w03_fractional_interval: notify_at = 2026-06-15T15:21:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000003' and module = 'walks'),
  9, 'w03_fractional_interval: buffer is 9 min');

-- ---------------------------------------------------------------------------
-- w04_two_and_a_half_hours
-- 2.5h interval: buffer 15 min.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000004', 'Care w04_two_and_a_half_hours', 'America/New_York');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000004', '01200000-0000-0000-0000-000000000004', 'C4', 'other', '{walks,meals}', 2.5, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000004', '01200000-0000-0000-0001-000000000004', 'walk', '2026-06-15T14:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000004', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000004' and module = 'walks'),
  1, 'w04_two_and_a_half_hours: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000004' and module = 'walks'),
  '2026-06-15T14:00:00.000Z'::timestamptz, 'w04_two_and_a_half_hours: anchor is the latest live log (2026-06-15T14:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000004' and module = 'walks'),
  '2026-06-15T16:30:00.000Z'::timestamptz, 'w04_two_and_a_half_hours: due_at = 2026-06-15T16:30:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000004' and module = 'walks'),
  '2026-06-15T16:15:00.000Z'::timestamptz, 'w04_two_and_a_half_hours: notify_at = 2026-06-15T16:15:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000004' and module = 'walks'),
  15, 'w04_two_and_a_half_hours: buffer is 15 min');

-- ---------------------------------------------------------------------------
-- w05_max_interval
-- 24h interval: buffer 144 clamps down to the 20 min ceiling.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000005', 'Care w05_max_interval', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000005', '01200000-0000-0000-0000-000000000005', 'C5', 'other', '{walks,meals}', 24, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000005', '01200000-0000-0000-0001-000000000005', 'walk', '2026-06-15T14:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000005', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000005' and module = 'walks'),
  1, 'w05_max_interval: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000005' and module = 'walks'),
  '2026-06-15T14:00:00.000Z'::timestamptz, 'w05_max_interval: anchor is the latest live log (2026-06-15T14:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000005' and module = 'walks'),
  '2026-06-16T14:00:00.000Z'::timestamptz, 'w05_max_interval: due_at = 2026-06-16T14:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000005' and module = 'walks'),
  '2026-06-16T13:40:00.000Z'::timestamptz, 'w05_max_interval: notify_at = 2026-06-16T13:40:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000005' and module = 'walks'),
  20, 'w05_max_interval: buffer is 20 min');

-- ---------------------------------------------------------------------------
-- w06_latest_live_walk_only
-- The anchor is the latest NON-deleted walk; a later deleted walk and later pee/food logs are ignored (modules read only their own log type).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000006', 'Care w06_latest_live_walk_only', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000006', '01200000-0000-0000-0000-000000000006', 'C6', 'other', '{walks,meals}', 3, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000006', '01200000-0000-0000-0001-000000000006', 'walk', '2026-06-15T08:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000006', '01200000-0000-0000-0001-000000000006', 'walk', '2026-06-15T12:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000006', '01200000-0000-0000-0001-000000000006', 'walk', '2026-06-15T15:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', now());
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000006', '01200000-0000-0000-0001-000000000006', 'pee', '2026-06-15T15:30:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000006', '01200000-0000-0000-0001-000000000006', 'food', '2026-06-15T15:40:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000006', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000006' and module = 'walks'),
  1, 'w06_latest_live_walk_only: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000006' and module = 'walks'),
  '2026-06-15T12:00:00.000Z'::timestamptz, 'w06_latest_live_walk_only: anchor is the latest live log (2026-06-15T12:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000006' and module = 'walks'),
  '2026-06-15T15:00:00.000Z'::timestamptz, 'w06_latest_live_walk_only: due_at = 2026-06-15T15:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000006' and module = 'walks'),
  '2026-06-15T14:42:00.000Z'::timestamptz, 'w06_latest_live_walk_only: notify_at = 2026-06-15T14:42:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000006' and module = 'walks'),
  18, 'w06_latest_live_walk_only: buffer is 18 min');

-- ---------------------------------------------------------------------------
-- w07_future_dated_walk
-- A walk logged with a future time: due is still exactly one interval after it (never the anchor itself).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000007', 'Care w07_future_dated_walk', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000007', '01200000-0000-0000-0000-000000000007', 'C7', 'other', '{walks,meals}', 4, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000007', '01200000-0000-0000-0001-000000000007', 'walk', '2026-06-15T15:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000007', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000007' and module = 'walks'),
  1, 'w07_future_dated_walk: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000007' and module = 'walks'),
  '2026-06-15T15:00:00.000Z'::timestamptz, 'w07_future_dated_walk: anchor is the latest live log (2026-06-15T15:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000007' and module = 'walks'),
  '2026-06-15T19:00:00.000Z'::timestamptz, 'w07_future_dated_walk: due_at = 2026-06-15T19:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000007' and module = 'walks'),
  '2026-06-15T18:40:00.000Z'::timestamptz, 'w07_future_dated_walk: notify_at = 2026-06-15T18:40:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000007' and module = 'walks'),
  20, 'w07_future_dated_walk: buffer is 20 min');

-- ---------------------------------------------------------------------------
-- w08_missed_walk_never_rolls_forward
-- The last walk was months ago: due stays at anchor + one interval and reads overdue; it never rolls forward (Δ7).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000008', 'Care w08_missed_walk_never_rolls_forward', 'America/Los_Angeles');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000008', '01200000-0000-0000-0000-000000000008', 'C8', 'other', '{walks,meals}', 4, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000008', '01200000-0000-0000-0001-000000000008', 'walk', '2026-01-01T08:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000008', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000008' and module = 'walks'),
  1, 'w08_missed_walk_never_rolls_forward: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000008' and module = 'walks'),
  '2026-01-01T08:00:00.000Z'::timestamptz, 'w08_missed_walk_never_rolls_forward: anchor is the latest live log (2026-01-01T08:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000008' and module = 'walks'),
  '2026-01-01T12:00:00.000Z'::timestamptz, 'w08_missed_walk_never_rolls_forward: due_at = 2026-01-01T12:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000008' and module = 'walks'),
  '2026-01-01T11:40:00.000Z'::timestamptz, 'w08_missed_walk_never_rolls_forward: notify_at = 2026-01-01T11:40:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000008' and module = 'walks'),
  20, 'w08_missed_walk_never_rolls_forward: buffer is 20 min');

-- ---------------------------------------------------------------------------
-- w09_no_walk_logged
-- No walk logged yet (only other types): nothing is predicted.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000009', 'Care w09_no_walk_logged', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000009', '01200000-0000-0000-0000-000000000009', 'C9', 'other', '{walks,meals}', 4, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000009', '01200000-0000-0000-0001-000000000009', 'pee', '2026-06-15T14:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000009', 'walks');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000009' and module = 'walks'),
  0, 'w09_no_walk_logged: nothing is due');

-- ---------------------------------------------------------------------------
-- h01_same_day_clean
-- Cleaned 10:00 CDT on Jun 10, every 7 days -> due Jun 17 at 10:00 CDT.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000010', 'Care h01_same_day_clean', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000010', '01200000-0000-0000-0000-000000000010', 'C10', 'other', '{habitat,meals}', null, 7);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000010', '01200000-0000-0000-0001-000000000010', 'habitat_clean', '2026-06-10T15:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000010', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000010' and module = 'habitat'),
  1, 'h01_same_day_clean: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000010' and module = 'habitat'),
  '2026-06-10T15:00:00.000Z'::timestamptz, 'h01_same_day_clean: anchor is the latest live log (2026-06-10T15:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000010' and module = 'habitat'),
  '2026-06-17T15:00:00.000Z'::timestamptz, 'h01_same_day_clean: due_at = 2026-06-17T15:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000010' and module = 'habitat'),
  '2026-06-17T15:00:00.000Z'::timestamptz, 'h01_same_day_clean: notify_at = 2026-06-17T15:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000010' and module = 'habitat'),
  0, 'h01_same_day_clean: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h02_late_night_local_date
-- Cleaned 23:30 CDT Jun 9 (04:30Z Jun 10): the household-local DATE (Jun 9) counts, not the UTC date -> due Jun 16 10:00 CDT.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000011', 'Care h02_late_night_local_date', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000011', '01200000-0000-0000-0000-000000000011', 'C11', 'other', '{habitat,meals}', null, 7);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000011', '01200000-0000-0000-0001-000000000011', 'habitat_clean', '2026-06-10T04:30:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000011', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000011' and module = 'habitat'),
  1, 'h02_late_night_local_date: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000011' and module = 'habitat'),
  '2026-06-10T04:30:00.000Z'::timestamptz, 'h02_late_night_local_date: anchor is the latest live log (2026-06-10T04:30:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000011' and module = 'habitat'),
  '2026-06-16T15:00:00.000Z'::timestamptz, 'h02_late_night_local_date: due_at = 2026-06-16T15:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000011' and module = 'habitat'),
  '2026-06-16T15:00:00.000Z'::timestamptz, 'h02_late_night_local_date: notify_at = 2026-06-16T15:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000011' and module = 'habitat'),
  0, 'h02_late_night_local_date: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h03_tokyo_next_day
-- 16:00Z Jun 10 is 01:00 Jun 11 in Tokyo -> due Jun 18 10:00 JST (01:00Z).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000012', 'Care h03_tokyo_next_day', 'Asia/Tokyo');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000012', '01200000-0000-0000-0000-000000000012', 'C12', 'other', '{habitat,meals}', null, 7);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000012', '01200000-0000-0000-0001-000000000012', 'habitat_clean', '2026-06-10T16:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000012', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000012' and module = 'habitat'),
  1, 'h03_tokyo_next_day: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000012' and module = 'habitat'),
  '2026-06-10T16:00:00.000Z'::timestamptz, 'h03_tokyo_next_day: anchor is the latest live log (2026-06-10T16:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000012' and module = 'habitat'),
  '2026-06-18T01:00:00.000Z'::timestamptz, 'h03_tokyo_next_day: due_at = 2026-06-18T01:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000012' and module = 'habitat'),
  '2026-06-18T01:00:00.000Z'::timestamptz, 'h03_tokyo_next_day: notify_at = 2026-06-18T01:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000012' and module = 'habitat'),
  0, 'h03_tokyo_next_day: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h04_spring_forward
-- Cleaned 10:00 EST Mar 5; DST starts Mar 8 -> due Mar 12 at 10:00 EDT (14:00Z), not 15:00Z.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000013', 'Care h04_spring_forward', 'America/New_York');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000013', '01200000-0000-0000-0000-000000000013', 'C13', 'other', '{habitat,meals}', null, 7);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000013', '01200000-0000-0000-0001-000000000013', 'habitat_clean', '2026-03-05T15:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000013', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000013' and module = 'habitat'),
  1, 'h04_spring_forward: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000013' and module = 'habitat'),
  '2026-03-05T15:00:00.000Z'::timestamptz, 'h04_spring_forward: anchor is the latest live log (2026-03-05T15:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000013' and module = 'habitat'),
  '2026-03-12T14:00:00.000Z'::timestamptz, 'h04_spring_forward: due_at = 2026-03-12T14:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000013' and module = 'habitat'),
  '2026-03-12T14:00:00.000Z'::timestamptz, 'h04_spring_forward: notify_at = 2026-03-12T14:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000013' and module = 'habitat'),
  0, 'h04_spring_forward: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h05_fall_back_14_days
-- London, cleaned 10:00 BST Oct 20, every 14 days; BST ends Oct 25 -> due Nov 3 10:00 GMT (10:00Z).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000014', 'Care h05_fall_back_14_days', 'Europe/London');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000014', '01200000-0000-0000-0000-000000000014', 'C14', 'other', '{habitat,meals}', null, 14);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000014', '01200000-0000-0000-0001-000000000014', 'habitat_clean', '2026-10-20T09:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000014', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000014' and module = 'habitat'),
  1, 'h05_fall_back_14_days: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000014' and module = 'habitat'),
  '2026-10-20T09:00:00.000Z'::timestamptz, 'h05_fall_back_14_days: anchor is the latest live log (2026-10-20T09:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000014' and module = 'habitat'),
  '2026-11-03T10:00:00.000Z'::timestamptz, 'h05_fall_back_14_days: due_at = 2026-11-03T10:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000014' and module = 'habitat'),
  '2026-11-03T10:00:00.000Z'::timestamptz, 'h05_fall_back_14_days: notify_at = 2026-11-03T10:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000014' and module = 'habitat'),
  0, 'h05_fall_back_14_days: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h06_missed_clean_never_rolls_forward
-- Last clean in January, every 7 days: due stays Jan 9 10:00 PST and reads overdue in June; never rolls forward (Δ7).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000015', 'Care h06_missed_clean_never_rolls_forward', 'America/Los_Angeles');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000015', '01200000-0000-0000-0000-000000000015', 'C15', 'other', '{habitat,meals}', null, 7);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000015', '01200000-0000-0000-0001-000000000015', 'habitat_clean', '2026-01-02T18:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000015', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000015' and module = 'habitat'),
  1, 'h06_missed_clean_never_rolls_forward: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000015' and module = 'habitat'),
  '2026-01-02T18:00:00.000Z'::timestamptz, 'h06_missed_clean_never_rolls_forward: anchor is the latest live log (2026-01-02T18:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000015' and module = 'habitat'),
  '2026-01-09T18:00:00.000Z'::timestamptz, 'h06_missed_clean_never_rolls_forward: due_at = 2026-01-09T18:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000015' and module = 'habitat'),
  '2026-01-09T18:00:00.000Z'::timestamptz, 'h06_missed_clean_never_rolls_forward: notify_at = 2026-01-09T18:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000015' and module = 'habitat'),
  0, 'h06_missed_clean_never_rolls_forward: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h07_latest_live_clean_only
-- A later deleted clean and a later walk are ignored; the anchor is the latest live habitat_clean.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000016', 'Care h07_latest_live_clean_only', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000016', '01200000-0000-0000-0000-000000000016', 'C16', 'other', '{habitat,meals}', null, 3);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000016', '01200000-0000-0000-0001-000000000016', 'habitat_clean', '2026-06-08T15:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000016', '01200000-0000-0000-0001-000000000016', 'habitat_clean', '2026-06-11T15:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', now());
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000016', '01200000-0000-0000-0001-000000000016', 'walk', '2026-06-11T16:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000016', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000016' and module = 'habitat'),
  1, 'h07_latest_live_clean_only: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000016' and module = 'habitat'),
  '2026-06-08T15:00:00.000Z'::timestamptz, 'h07_latest_live_clean_only: anchor is the latest live log (2026-06-08T15:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000016' and module = 'habitat'),
  '2026-06-11T15:00:00.000Z'::timestamptz, 'h07_latest_live_clean_only: due_at = 2026-06-11T15:00:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000016' and module = 'habitat'),
  '2026-06-11T15:00:00.000Z'::timestamptz, 'h07_latest_live_clean_only: notify_at = 2026-06-11T15:00:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000016' and module = 'habitat'),
  0, 'h07_latest_live_clean_only: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h08_half_hour_offset_zone
-- Kolkata (+05:30): 20:00Z Jun 10 is 01:30 Jun 11 local; every day -> due Jun 12 10:00 IST (04:30Z).
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000017', 'Care h08_half_hour_offset_zone', 'Asia/Kolkata');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000017', '01200000-0000-0000-0000-000000000017', 'C17', 'other', '{habitat,meals}', null, 1);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000017', '01200000-0000-0000-0001-000000000017', 'habitat_clean', '2026-06-10T20:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000017', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000017' and module = 'habitat'),
  1, 'h08_half_hour_offset_zone: a care_state row exists');
insert into _tap(line) select is(
  (select anchor_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000017' and module = 'habitat'),
  '2026-06-10T20:00:00.000Z'::timestamptz, 'h08_half_hour_offset_zone: anchor is the latest live log (2026-06-10T20:00:00.000Z)');
insert into _tap(line) select is(
  (select due_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000017' and module = 'habitat'),
  '2026-06-12T04:30:00.000Z'::timestamptz, 'h08_half_hour_offset_zone: due_at = 2026-06-12T04:30:00.000Z (client parity)');
insert into _tap(line) select is(
  (select notify_at from public.care_state where pet_id = '01200000-0000-0000-0001-000000000017' and module = 'habitat'),
  '2026-06-12T04:30:00.000Z'::timestamptz, 'h08_half_hour_offset_zone: notify_at = 2026-06-12T04:30:00.000Z');
insert into _tap(line) select is(
  (select buffer_minutes from public.care_state where pet_id = '01200000-0000-0000-0001-000000000017' and module = 'habitat'),
  0, 'h08_half_hour_offset_zone: buffer is 0 min');

-- ---------------------------------------------------------------------------
-- h09_no_clean_logged
-- No clean logged yet: nothing is due.
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone) values ('01200000-0000-0000-0000-000000000018', 'Care h09_no_clean_logged', 'America/Chicago');
insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days) values ('01200000-0000-0000-0001-000000000018', '01200000-0000-0000-0000-000000000018', 'C18', 'other', '{habitat,meals}', null, 7);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at) values (gen_random_uuid(), '01200000-0000-0000-0000-000000000018', '01200000-0000-0000-0001-000000000018', 'walk', '2026-06-11T16:00:00.000Z'::timestamptz, 'aaaaaaaa-0000-0000-0000-000000000001', null);
select app.recompute_care('01200000-0000-0000-0001-000000000018', 'habitat');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = '01200000-0000-0000-0001-000000000018' and module = 'habitat'),
  0, 'h09_no_clean_logged: nothing is due');

-- END GENERATED care vectors

-- ===========================================================================
-- Part 2 — behaviour
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Baseline: potty is untouched by any of this
-- ---------------------------------------------------------------------------

create temp table _break_before on commit drop as
  select break_type, predicted_at, notify_at from public.prediction_state
   where pet_id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'a legacy pet ({potty,meals,meds,visits}) has no care_state');

-- A walk logged while walks is OFF is stored but predicts nothing.
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('0c120000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'walk', now() - interval '5 hours',
        'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'a walk log for a pet with walks off creates no care_state (module gate)');

-- ---------------------------------------------------------------------------
-- Switching walks + habitat ON (as an editor)
-- ---------------------------------------------------------------------------

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('0c120000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'habitat_clean', now() - interval '2 days',
        'aaaaaaaa-0000-0000-0000-000000000001');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');  -- bob, member

update public.pets
   set care_modules = '{potty,walks,meals,meds,habitat,visits}',
       walk_interval_hours = 4,
       habitat_interval_days = 7
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

select tests.become_service();

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  2, 'switching walks and habitat on computes a row for each from the existing logs');

insert into _tap(line) select ok(
  (select due_at = anchor_at + interval '4 hours'
          and notify_at = due_at - interval '20 minutes'
          and anchor_log_id = '0c120000-0000-0000-0000-000000000001'
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'walks: due = last walk + 4h, notify 20 min before (one interval, even though it is past)');

insert into _tap(line) select ok(
  (select due_at = (((anchor_at at time zone 'America/Los_Angeles')::date + 7) + time '10:00')
                     at time zone 'America/Los_Angeles'
          and notify_at = due_at
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'habitat'),
  'habitat: due 10:00 household time on local date of last clean + 7 days, notify at due');

insert into _tap(line) select is(
  (select array_agg(predicted_at order by break_type) from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  (select array_agg(predicted_at order by break_type) from _break_before),
  'potty predictions are untouched by walk / habitat logs and module changes');

-- ---------------------------------------------------------------------------
-- RLS: members read, nobody writes; walkers cannot change care settings
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'walker12@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Wren"}', '', '', '', '')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role, member_expires_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000c2',
        'walker', now() + interval '1 day');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000c2');

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  2, 'a walker (member) can read the pet''s care_state');

insert into _tap(line) select throws_ok(
  $$insert into public.care_state (pet_id, module, anchor_at, interval_hours, due_at, buffer_minutes)
    values ('dddddddd-0000-0000-0000-0000000000a1', 'walks', now(), 1, now(), 5)
    on conflict do nothing$$,
  '42501', null, 'a walker cannot insert care_state');

insert into _tap(line) select throws_ok(
  $$update public.care_state set notify_at = now() + interval '1 day'$$,
  '42501', null, 'a walker cannot update care_state');

insert into _tap(line) select throws_ok(
  $$delete from public.care_state$$,
  '42501', null, 'a walker cannot delete care_state');

update public.pets set walk_interval_hours = 1, care_modules = '{meals}'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');  -- alice, owner

insert into _tap(line) select throws_ok(
  $$update public.care_state set notify_at = now() + interval '1 day'$$,
  '42501', null, 'not even the owner can write care_state (server-only)');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');  -- carol, household B

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'another household cannot see the pet''s care_state');

select tests.become_service();

insert into _tap(line) select ok(
  (select walk_interval_hours = 4 and 'walks' = any(care_modules)
     from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  'a walker cannot change the walk interval or the care modules');

-- ---------------------------------------------------------------------------
-- The care_due kind, dispatch and dedupe exactly-once
-- ---------------------------------------------------------------------------

-- Quiet hours defer walk / habitat pushes (as for breaks).
update public.households
   set quiet_hours_start = ((now() at time zone 'America/Los_Angeles')::time - interval '1 hour'),
       quiet_hours_end   = ((now() at time zone 'America/Los_Angeles')::time + interval '1 hour')
 where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.due_care_items() where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'quiet hours defer a due care push');

update public.households set quiet_hours_start = null, quiet_hours_end = null
 where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'),
  1, 'the overdue walk is due for a push');

insert into _tap(line) select is(
  (select count(*)::int from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'habitat'),
  0, 'the habitat clean (due in 5 days) is not');

insert into _tap(line) select is(
  (select dedupe_key from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'),
  'care:dddddddd-0000-0000-0000-0000000000a1:walks:' ||
    (select to_char(due_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI')
       from public.care_state
      where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'walk dedupe key is care:{pet}:walks:{household-local due date and time}');

-- What the dispatcher does: INSERT keyed on dedupe_key.
create temp table _sent (id uuid, dedupe_key text, kind public.notif_kind) on commit drop;

with ins as (
  insert into public.notifications
    (household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
  select household_id, pet_id, 'care_due', dedupe_key, 'Walk time for Rex', 'b',
         jsonb_build_object('careModule', care_module, 'petId', pet_id, 'dueOn', due_at),
         now(), now(), 'sent'
    from public.due_care_items()
   where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'
  returning id, dedupe_key, kind
)
insert into _sent select id, dedupe_key, kind from ins;

insert into _tap(line) select is(
  (select kind::text from _sent), 'care_due', 'a care_due notification is accepted');

insert into _tap(line) select throws_ok(
  $$insert into public.notifications
      (household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
    select household_id, pet_id, 'care_due', dedupe_key, 't', 'b',
           jsonb_build_object('careModule', care_module), now(), now(), 'sent'
      from public.due_care_items()
     where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'$$,
  '23505', null, 'a replayed tick hits the unique dedupe_key (exactly once)');

create temp table _due_before on commit drop as
  select due_at from public.care_state
   where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks';

select public.mark_care_dispatched('dddddddd-0000-0000-0000-0000000000a1', 'walks',
                                   (select id from _sent));

insert into _tap(line) select ok(
  (select notify_at is null and due_at = (select due_at from _due_before)
          and last_notification_id = (select id from _sent)
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'after dispatch notify_at clears and due_at stays put (never rolls forward)');

select app.reconcile_care();
select app.recompute_care('dddddddd-0000-0000-0000-0000000000a1', 'walks');
update public.pets set name = 'Rex' where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.due_care_items() where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'reconcile / recompute / an unrelated edit do not re-arm a dispatched push');

-- ---------------------------------------------------------------------------
-- Snooze (log-action SNOOZE_15 on a care push)
-- ---------------------------------------------------------------------------

insert into _tap(line) select is(
  public.claim_notification((select id from _sent), 'SNOOZE_15', null),
  (select id from _sent), 'the snooze tap claims the push');

select public.snooze_care('dddddddd-0000-0000-0000-0000000000a1', 'walks', (select id from _sent), 15);

insert into _tap(line) select ok(
  (select status = 'sent' and action is null from public.notifications where id = (select id from _sent)),
  'snooze re-opens the claimed push (the partner''s copy can still be answered)');

insert into _tap(line) select ok(
  (select reask_seq = 1 and notify_at > now() and snoozed_until > now()
          and due_at = (select due_at from _due_before)
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'snooze re-arms the push 15 min out without moving due_at');

insert into _tap(line) select is(
  (select count(*)::int from public.due_care_items() where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'nothing is due while snoozed');

-- Time passes.
update public.care_state set notify_at = now() - interval '1 minute', snoozed_until = now() - interval '1 minute'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks';

insert into _tap(line) select is(
  (select dedupe_key from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'),
  (select dedupe_key from _sent) || ':r1',
  'the snooze re-ask mints exactly one new key (:r1)');

-- The re-ask push goes out.
insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
select '0a120000-0000-0000-0000-000000000002', household_id, pet_id, 'care_due', dedupe_key, 't', 'b',
       jsonb_build_object('careModule', care_module), now(), now(), 'sent'
  from public.due_care_items()
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks';

-- An in-flight habitat push and break push, which a walk must not touch.
insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values
  ('0a120000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'care_due', 'test:care12:habitat',
   't', 'b', jsonb_build_object('careModule','habitat'), now(), now(), 'sent'),
  ('0a120000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'test:care12:break',
   't', 'b', jsonb_build_object('breakType','pee'), now(), now(), 'sent');

-- ---------------------------------------------------------------------------
-- "Done" (log-action LOG_YES on a care push): claim, then write the walk log
-- ---------------------------------------------------------------------------

insert into _tap(line) select is(
  public.claim_notification((select id from _sent), 'LOG_YES', null),
  (select id from _sent), 'the Done tap claims the push (gate 1)');

insert into public.logs (id, household_id, pet_id, type, occurred_at, note, source, notification_id, created_by)
values ('0c120000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'walk', now(), 'Logged from notification',
        'notification_yes', (select id from _sent), null);

insert into _tap(line) select throws_ok(
  $$insert into public.logs (id, household_id, pet_id, type, occurred_at, source, notification_id)
    values ('0c120000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-0000000000a1',
            'dddddddd-0000-0000-0000-0000000000a1', 'walk', now(), 'notification_yes', null)$$,
  '23505', null, 'a retried Done re-inserts the same client log id and collides (gate 2)');

insert into _tap(line) select ok(
  (select anchor_log_id = '0c120000-0000-0000-0000-000000000010'
          and due_at = anchor_at + interval '4 hours'
          and notify_at = due_at - interval '20 minutes'
          and reask_seq = 0 and snoozed_until is null
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'the Done walk starts a new cycle: due = now + 4h, re-ask chain reset');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = (select id from _sent)),
  'actioned', 'the answered push stays actioned');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a120000-0000-0000-0000-000000000002'),
  'superseded', 'the in-flight re-ask push for walks is superseded by the walk');

insert into _tap(line) select is(
  (select array_agg(status::text order by id) from public.notifications
    where id in ('0a120000-0000-0000-0000-000000000003', '0a120000-0000-0000-0000-000000000004')),
  array['sent','sent'], 'a walk does not supersede the habitat push or the break push');

-- Undo (soft delete) of the Done walk re-anchors on the previous walk.
update public.logs set deleted_at = now() where id = '0c120000-0000-0000-0000-000000000010';

insert into _tap(line) select ok(
  (select anchor_log_id = '0c120000-0000-0000-0000-000000000001'
          and due_at = (select due_at from _due_before)
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'undoing a walk re-anchors on the previous walk (same due_at as before)');

insert into _tap(line) select is(
  (select dedupe_key from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'),
  (select dedupe_key from _sent),
  'and its push key is the one already sent, so it cannot be sent twice');

update public.logs set deleted_at = null where id = '0c120000-0000-0000-0000-000000000010';

-- ---------------------------------------------------------------------------
-- Habitat: null interval, household timezone
-- ---------------------------------------------------------------------------

update public.pets set habitat_interval_days = null where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'habitat'),
  0, 'habitat with a null (unresolved) interval has no server row — no species defaults in SQL');

update public.pets set habitat_interval_days = 7 where id = 'dddddddd-0000-0000-0000-0000000000a1';

update public.households set timezone = 'Asia/Tokyo' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

insert into _tap(line) select ok(
  (select due_at = (((anchor_at at time zone 'Asia/Tokyo')::date + 7) + time '10:00') at time zone 'Asia/Tokyo'
     from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'habitat'),
  'a household timezone change recomputes the habitat due time in the new zone');

update public.care_state set notify_at = now() - interval '1 minute'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'habitat';

insert into _tap(line) select is(
  (select dedupe_key from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'habitat'),
  'care:dddddddd-0000-0000-0000-0000000000a1:habitat:' ||
    (select to_char(due_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') from public.care_state
      where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'habitat'),
  'habitat dedupe key is care:{pet}:habitat:{household-local due date}');

update public.households set timezone = 'America/Los_Angeles' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------------------
-- Gating: switching a module OFF
-- ---------------------------------------------------------------------------

insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values
  ('0a120000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'care_due', 'test:care12:walks-inflight',
   't', 'b', jsonb_build_object('careModule','walks'), now(), now(), 'sent');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');  -- bob, member
update public.pets set care_modules = '{potty,meals,meds,habitat,visits}'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';
select tests.become_service();

insert into _tap(line) select is(
  (select count(*)::int from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  0, 'switching walks off deletes its care_state');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a120000-0000-0000-0000-000000000005'),
  'superseded', 'switching walks off supersedes an in-flight walks push');

insert into _tap(line) select is(
  public.claim_notification('0a120000-0000-0000-0000-000000000005', 'LOG_YES', null),
  null::uuid, 'so a late Done tap on it cannot claim it (no log is written)');

insert into _tap(line) select ok(
  (select count(*) = 1 from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'habitat')
  and (select status = 'sent' from public.notifications where id = '0a120000-0000-0000-0000-000000000003'),
  'habitat (still on) keeps its state and its in-flight push');

select app.recompute_care('dddddddd-0000-0000-0000-0000000000a1', 'walks');
select app.reconcile_care();

insert into _tap(line) select is(
  (select count(*)::int from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  0, 'direct recompute and the nightly reconcile stay gated');

insert into _tap(line) select is(
  (select count(*)::int from public.due_care_items()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and care_module = 'walks'),
  0, 'due_care_items is empty for walks while it is off');

-- Back on: the same due time as before (the anchor is the Done walk again).
update public.pets set care_modules = '{potty,walks,meals,meds,habitat,visits}'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select ok(
  (select anchor_log_id = '0c120000-0000-0000-0000-000000000010' from public.care_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and module = 'walks'),
  'switching walks back on recomputes from the latest walk');

-- Archiving the pet clears everything and supersedes its pushes.
update public.pets set archived_at = now() where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.care_state where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'archiving the pet deletes its care_state');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a120000-0000-0000-0000-000000000003'),
  'superseded', 'archiving the pet supersedes its in-flight care pushes');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a120000-0000-0000-0000-000000000004'),
  'sent', 'the break push is not a care push and is left to the break path');

update public.pets set archived_at = null where id = 'dddddddd-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------------------
-- App-version gate
-- ---------------------------------------------------------------------------

insert into _tap(line) select is(app.care_push_min_app_version(), '1.1.0',
  'care_due pushes need app version 1.1.0 or later');

insert into _tap(line) select ok(
  app.version_at_least('1.1.0', '1.1.0') and app.version_at_least('1.10.0', '1.9.0')
  and app.version_at_least('2', '1.1.0') and app.version_at_least('1.1', '1.1.0')
  and app.version_at_least('1.2.0-beta.1', '1.1.0')
  and not app.version_at_least('1.0.9', '1.1.0') and not app.version_at_least('1.0.0', '1.1.0')
  and not app.version_at_least(null, '1.1.0') and not app.version_at_least('abc', '1.1.0')
  and not app.version_at_least('', '1.1.0'),
  'version_at_least compares dotted versions numerically');

insert into public.notification_tokens (user_id, device_id, expo_push_token, platform, app_version) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'care12-alice', 'ExponentPushToken[alice-old]', 'ios', '1.0.0'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'care12-bob',   'ExponentPushToken[bob-new]',   'ios', '1.1.0'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'care12-bob2',  'ExponentPushToken[bob-null]',  'android', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'care12-alice2','ExponentPushToken[alice-rev]', 'android', '1.2.0'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'care12-wren',  'ExponentPushToken[wren]',     'ios', '1.3.0'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'care12-carol', 'ExponentPushToken[carol]',    'ios', '9.0.0');

update public.notification_tokens set revoked_at = now() where device_id = 'care12-alice2';

insert into _tap(line) select is(
  (select array_agg(expo_push_token order by expo_push_token)
     from public.care_push_tokens('aaaaaaaa-0000-0000-0000-0000000000a1')),
  array['ExponentPushToken[bob-new]', 'ExponentPushToken[wren]'],
  'care pushes go only to this household''s live tokens on app >= 1.1.0');

update public.household_members set member_expires_at = now() - interval '1 minute'
 where user_id = 'aaaaaaaa-0000-0000-0000-0000000000c2';

insert into _tap(line) select is(
  (select array_agg(expo_push_token order by expo_push_token)
     from public.care_push_tokens('aaaaaaaa-0000-0000-0000-0000000000a1')),
  array['ExponentPushToken[bob-new]'],
  'an expired walker stops receiving care pushes');

-- ---------------------------------------------------------------------------
-- Grants: the dispatch RPCs are service-role only
-- ---------------------------------------------------------------------------

insert into _tap(line) select ok(
  not has_function_privilege('authenticated', 'public.due_care_items()', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_care_dispatched(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.snooze_care(uuid, text, uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.care_push_tokens(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.care_push_tokens(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.due_care_items()', 'execute'),
  'care dispatch RPCs are callable by the service role only');

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select
  (select count(*) from _tap)                                  as tests_run,
  (select count(*) from _tap where line like 'not ok%')         as failed,
  coalesce((select string_agg(line, ' | ' order by seq)
              from _tap where line like 'not ok%'), 'ALL PASS') as failures;

rollback;
