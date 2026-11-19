-- 010_care_modules.sql
-- Care modules (0019_care_modules.sql, docs/CARE_MODULES_PLAN.md "Testing").
--
-- The server half of the potty on/off switch. The client mirror is potty.status()/reminders()
-- returning nothing (lib/care/modules/potty.ts, lib/__tests__/careModules.test.ts); if these two
-- disagree, the app shows one thing while the push does another.
--
-- Run (after 000_helpers.sql):
--   supabase db query --linked -f supabase/tests/010_care_modules.sql

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- Fixture ids (000_helpers.sql):
--   household A aaaaaaaa-…-a1 (America/Los_Angeles): alice owner …01, bob member …02
--   Rex dddddddd-…-a1 (dog, 4h/6h, feed 08:00)   Milo dddddddd-…-b1 (household B)

-- ---------------------------------------------------------------------------
-- Backfill / default and the domain
-- ---------------------------------------------------------------------------

insert into _tap(line) select is(
  (select care_modules::text[] from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  array['potty','meals','meds','visits'],
  'a pet created without care_modules gets today''s modules {potty,meals,meds,visits}');

-- The 0019 backfill is the column default applied by `add column … not null default`, so
-- asserting the default (rather than every live row, which real users may have edited since)
-- is what proves the backfill.
insert into _tap(line) select ok(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'care_modules')
    like '%{potty,meals,meds,visits}%',
  'the care_modules default (and so the 0019 backfill) is {potty,meals,meds,visits}');

insert into _tap(line) select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'care_modules'),
  'NO', 'care_modules is NOT NULL');

insert into _tap(line) select throws_ok(
  $$update public.pets set care_modules = '{potty,zoomies}'
     where id = 'dddddddd-0000-0000-0000-0000000000a1'$$,
  '23514', null,
  'the care_module domain rejects an unknown module id');

insert into _tap(line) select throws_ok(
  $$update public.pets set care_modules = array['meals', null]::public.care_module[]
     where id = 'dddddddd-0000-0000-0000-0000000000a1'$$,
  '23514', null,
  'a NULL module element is rejected');

insert into _tap(line) select ok(
  app.module_enabled('dddddddd-0000-0000-0000-0000000000a1', 'potty')
  and not app.module_enabled('dddddddd-0000-0000-0000-0000000000a1', 'walks')
  and not app.module_enabled('00000000-0000-0000-0000-000000000000', 'potty'),
  'app.module_enabled reads the stored list (false for an unknown pet)');

-- ---------------------------------------------------------------------------
-- Baseline with potty on: predictions exist, and the break: key shape
-- ---------------------------------------------------------------------------

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  2, 'with potty on, Rex has a pee and a poo prediction');

-- Make both predictions due so due_break_predictions() emits their keys.
update public.prediction_state set notify_at = now() - interval '1 minute'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1';

create temp table _before on commit drop as
  select ps.break_type, ps.predicted_at,
         (select d.dedupe_key from public.due_break_predictions() d
           where d.pet_id = ps.pet_id and d.break_type = ps.break_type) as dedupe_key
    from public.prediction_state ps
   where ps.pet_id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select dedupe_key from _before where break_type = 'pee'),
  'break:dddddddd-0000-0000-0000-0000000000a1:pee:' ||
    (select to_char(predicted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')
       from _before where break_type = 'pee'),
  'the break: dedupe key for an existing pet keeps its exact shape');

-- In-flight pushes: a sent break push (must be superseded) and a sent meal push (must not).
insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values
  ('0a100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'test:care:break',
   'Did Rex go?', 'Pee break', jsonb_build_object('breakType','pee'), now(), now(), 'sent'),
  ('0a100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'meal', 'test:care:meal',
   'Dinner', 'Did Rex eat?', '{}'::jsonb, now(), now(), 'sent'),
  ('0a100000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'test:care:break-done',
   'Did Rex go?', 'Poo break', jsonb_build_object('breakType','poo'), now(), now(), 'actioned');

-- ---------------------------------------------------------------------------
-- Walkers cannot change care goals; editors can
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'walker@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Walt"}', '', '', '', '')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role, member_expires_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000c1',
        'walker', now() + interval '1 day');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-0000000000c1');

insert into _tap(line) select is(
  (select count(*)::int from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  1, 'the walker can see Rex (is_member)');

update public.pets set care_modules = '{meals}'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

select tests.become_service();

insert into _tap(line) select is(
  (select care_modules::text[] from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  array['potty','meals','meds','visits'],
  'a walker cannot update care_modules (pets_update requires is_editor)');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a100000-0000-0000-0000-000000000001'),
  'sent', 'and so nothing was superseded by the walker''s attempt');

-- ---------------------------------------------------------------------------
-- Switching potty OFF (as an editor)
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');  -- bob, member

update public.pets set care_modules = '{meals,meds,visits}'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

select tests.become_service();

insert into _tap(line) select is(
  (select care_modules::text[] from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  array['meals','meds','visits'],
  'a member (editor) can update care_modules');

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'switching potty off deletes the pet''s prediction_state');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a100000-0000-0000-0000-000000000001'),
  'superseded', 'switching potty off supersedes an in-flight ''sent'' break push');

insert into _tap(line) select is(
  public.claim_notification('0a100000-0000-0000-0000-000000000001', 'LOG_YES', null),
  null::uuid, 'so a late Yes tap on that push cannot claim it (no log is written)');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a100000-0000-0000-0000-000000000002'),
  'sent', 'a sent meal push is left alone');

insert into _tap(line) select is(
  (select status::text from public.notifications where id = '0a100000-0000-0000-0000-000000000003'),
  'actioned', 'an already-actioned break push is left alone');

insert into _tap(line) select is(
  (select count(*)::int from public.due_break_predictions()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'due_break_predictions is empty for the pet while potty is off');

-- Every other path that recomputes must respect the gate too.
select app.recompute_prediction('dddddddd-0000-0000-0000-0000000000a1', 'pee');
select app.reconcile_predictions();
update public.pets set pee_hold_hours = 3 where id = 'dddddddd-0000-0000-0000-0000000000a1';
update public.pets set pee_hold_hours = 4 where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'direct recompute, nightly reconcile and a hold edit all stay gated');

-- ---------------------------------------------------------------------------
-- Meals, meds and visits still dispatch with potty off
-- ---------------------------------------------------------------------------

insert into public.feed_times (id, pet_id, local_time, label, active)
values ('0d100000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000a1',
        (now() at time zone 'America/Los_Angeles')::time - interval '30 seconds', 'Dinner', true);

insert into public.medications (id, pet_id, name, local_time, active)
values ('0c100000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000a1',
        'Rimadyl', (now() at time zone 'America/Los_Angeles')::time - interval '30 seconds', true);

insert into public.appointments (id, household_id, type, title, starts_at)
values ('0f100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'vet', 'Checkup', now() + interval '1 day');
insert into public.appointment_pets (appointment_id, pet_id)
values ('0f100000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000a1');
insert into public.appointment_reminders (id, appointment_id, offset_minutes, fire_at)
values ('0f100000-0000-0000-0000-000000000002', '0f100000-0000-0000-0000-000000000001',
        1440, now() - interval '1 minute');

insert into _tap(line) select is(
  (select count(*)::int from public.due_meals()
    where feed_time_id = '0d100000-0000-0000-0000-000000000001'),
  1, 'meal pushes still dispatch with potty off');

insert into _tap(line) select is(
  (select count(*)::int from public.due_medications()
    where medication_id = '0c100000-0000-0000-0000-000000000001'),
  1, 'medication pushes still dispatch with potty off');

insert into _tap(line) select is(
  (select count(*)::int from public.due_appointment_reminders()
    where reminder_id = '0f100000-0000-0000-0000-000000000002'),
  1, 'appointment reminders still dispatch with potty off');

-- The feed-time insert above re-ran recompute_prediction; still gated.
insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'a feed-time change does not bring the prediction back while potty is off');

-- Remove the extra slot before switching back on so the anchor is the original 08:00 one
-- (its delete trigger also recomputes — still gated).
delete from public.feed_times where id = '0d100000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Switching potty back ON restores the same prediction
-- ---------------------------------------------------------------------------

update public.pets set care_modules = '{potty,meals,meds,visits}'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  2, 'switching potty back on recomputes both predictions');

insert into _tap(line) select is(
  (select predicted_at from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  (select predicted_at from _before where break_type = 'pee'),
  'switching potty back on gives the same pee predicted_at');

insert into _tap(line) select is(
  (select predicted_at from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'poo'),
  (select predicted_at from _before where break_type = 'poo'),
  'and the same poo predicted_at');

update public.prediction_state set notify_at = now() - interval '1 minute'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select dedupe_key from public.due_break_predictions()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  (select dedupe_key from _before where break_type = 'pee'),
  'the break: key after an off/on cycle is identical to before');

-- ---------------------------------------------------------------------------
-- A log while potty is off writes the log but no prediction
-- ---------------------------------------------------------------------------

update public.pets set care_modules = '{meals}'
 where id = 'dddddddd-0000-0000-0000-0000000000b1';

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('0b100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000b1',
        'dddddddd-0000-0000-0000-0000000000b1', 'pee', now() - interval '10 minutes',
        'aaaaaaaa-0000-0000-0000-000000000003');

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000b1'),
  0, 'a pee log for a pet with potty off is stored but creates no prediction');

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select
  (select count(*) from _tap)                                  as tests_run,
  (select count(*) from _tap where line like 'not ok%')         as failed,
  coalesce((select string_agg(line, ' | ' order by seq)
              from _tap where line like 'not ok%'), 'ALL PASS') as failures;

rollback;
