-- 004_triggers.sql
-- The trigger chain that keeps derived state honest. Each of these fires on a path the
-- user takes constantly, so a silent break here degrades the product without erroring.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- ---------------------------------------------------------------------------
-- Profile bootstrap on signup (incl. anonymous users)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'newbie@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Newbie"}', '', '', '', '');

insert into _tap(line) select is(
  (select display_name from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-0000000000ff'),
  'Newbie', 'a new auth user gets a profile with their display name');

-- Anonymous sign-in carries no metadata, so the fallback name matters.
insert into auth.users (id, instance_id, aud, role, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-0000000000fe', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '',
        now(), now(), '{}', '{}', '', '', '', '');

insert into _tap(line) select is(
  (select display_name from public.profiles
    where user_id = 'aaaaaaaa-0000-0000-0000-0000000000fe'),
  'Pet parent', 'an anonymous user falls back to "Pet parent"');

-- ---------------------------------------------------------------------------
-- touch_updated_at — the server clock is the only clock LWW sync may trust
-- ---------------------------------------------------------------------------

update public.pets set updated_at = now() - interval '1 day'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

update public.pets set name = 'Rexy'
 where id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select ok(
  (select updated_at > now() - interval '1 minute' from public.pets
    where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  'updating a pet stamps updated_at from the server clock');

-- ---------------------------------------------------------------------------
-- Appointment reschedule re-arms every reminder
-- ---------------------------------------------------------------------------
-- Without this, moving a vet visit leaves reminders pointing at the old time, and any
-- already-sent reminder never fires again for the new one.

insert into public.appointments (id, household_id, type, title, starts_at)
values ('ab000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'vet', 'Checkup', now() + interval '10 days');

insert into public.appointment_reminders (appointment_id, offset_minutes, fire_at, sent_at)
values ('ab000000-0000-0000-0000-000000000001', 1440,
        now() + interval '9 days', now());

update public.appointments set starts_at = now() + interval '20 days'
 where id = 'ab000000-0000-0000-0000-000000000001';

insert into _tap(line) select is(
  (select round((extract(epoch from (a.starts_at - r.fire_at))/60)::numeric, 0)
     from public.appointment_reminders r
     join public.appointments a on a.id = r.appointment_id
    where r.appointment_id = 'ab000000-0000-0000-0000-000000000001'),
  1440::numeric, 'rescheduling recomputes fire_at to starts_at - offset');

insert into _tap(line) select is(
  (select sent_at from public.appointment_reminders
    where appointment_id = 'ab000000-0000-0000-0000-000000000001'),
  null::timestamptz, 'and clears sent_at so the reminder fires again for the new date');

-- Editing an unrelated field must NOT re-arm an already-sent reminder.
update public.appointment_reminders set sent_at = now()
 where appointment_id = 'ab000000-0000-0000-0000-000000000001';
update public.appointments set title = 'Checkup (renamed)'
 where id = 'ab000000-0000-0000-0000-000000000001';

insert into _tap(line) select ok(
  (select sent_at is not null from public.appointment_reminders
    where appointment_id = 'ab000000-0000-0000-0000-000000000001'),
  'renaming an appointment does not resend its reminders');

-- ---------------------------------------------------------------------------
-- on_log_insert supersedes in-flight break pushes
-- ---------------------------------------------------------------------------
-- This is what makes idempotency gate 1 work: if someone logs manually in the app between
-- a push being sent and a partner tapping "Yes", the stale tap must become a no-op.

insert into public.feed_times (pet_id, local_time, active)
values ('dddddddd-0000-0000-0000-0000000000a1', '19:00', true)
on conflict do nothing;

insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values
  ('ac000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'break:test:pee:1',
   'Pee?', 'Did Rex go?', '{"breakType":"pee"}', now(), now(), 'sent'),
  ('ac000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1',
   'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'break:test:poo:1',
   'Poo?', 'Did Rex go?', '{"breakType":"poo"}', now(), now(), 'sent');

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('ad000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'pee', now(),
        'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select status::text from public.notifications
    where id = 'ac000000-0000-0000-0000-000000000001'),
  'superseded', 'a manual pee log supersedes the in-flight pee push');

insert into _tap(line) select is(
  (select status::text from public.notifications
    where id = 'ac000000-0000-0000-0000-000000000002'),
  'sent', 'but leaves the poo push alone — supersede is per break type');

-- A log written BY a notification must not supersede its own notification.
insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values ('ac000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'break:test:pee:2',
        'Pee?', 'Did Rex go?', '{"breakType":"pee"}', now(), now(), 'sent');

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by,
                         source, notification_id)
values ('ad000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'pee', now(),
        'aaaaaaaa-0000-0000-0000-000000000001', 'notification_yes',
        'ac000000-0000-0000-0000-000000000003');

insert into _tap(line) select is(
  (select status::text from public.notifications
    where id = 'ac000000-0000-0000-0000-000000000003'),
  'sent', 'a notification-driven log does not supersede its own notification');

-- ---------------------------------------------------------------------------
-- feed_times changes create and destroy predictions
-- ---------------------------------------------------------------------------
-- The plan omitted this trigger entirely, so a pet's first feed time would never start
-- predictions until some unrelated edit happened to fire a different trigger.

insert into public.pets (id, household_id, name, species, pee_hold_hours, poop_hold_hours)
values ('ae000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'Trigger Test', 'dog', 5, 5);

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'ae000000-0000-0000-0000-000000000001'),
  0, 'no feed time yet, so no prediction');

insert into public.feed_times (pet_id, local_time, active)
values ('ae000000-0000-0000-0000-000000000001', '09:00', true);

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'ae000000-0000-0000-0000-000000000001'),
  2, 'adding the first feed time creates both break predictions');

update public.feed_times set active = false
 where pet_id = 'ae000000-0000-0000-0000-000000000001';

insert into _tap(line) select is(
  (select count(*)::int from public.prediction_state
    where pet_id = 'ae000000-0000-0000-0000-000000000001'),
  0, 'deactivating the last feed time removes them again');

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select
  (select count(*) from _tap)                                  as tests_run,
  (select count(*) from _tap where line like 'not ok%')         as failed,
  coalesce((select string_agg(line, ' | ' order by seq)
              from _tap where line like 'not ok%'), 'ALL PASS') as failures;

rollback;
