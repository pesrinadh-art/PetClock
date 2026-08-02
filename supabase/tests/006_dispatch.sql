-- 006_dispatch.sql
-- The dispatch layer (BE-3): due-queries, the claim gate, and roll-forward.
--
-- Two of these tests exist because the corresponding bug was found live on staging. Both
-- were invisible in normal operation and would only have surfaced under load or under a
-- race, so they get permanent guards.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- ---------------------------------------------------------------------------
-- GATE 1 — claim_notification
-- ---------------------------------------------------------------------------

insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values ('0a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'test:claim:1',
        'Pee?', 'Did Rex go?', jsonb_build_object('breakType','pee'), now(), now(), 'sent');

insert into _tap(line) select is(
  public.claim_notification('0a000000-0000-0000-0000-000000000001', 'LOG_YES', null),
  '0a000000-0000-0000-0000-000000000001'::uuid,
  'the first caller wins the claim and gets the id back');

-- REGRESSION GUARD (migration 0014).
-- This function used to return `public.notifications`, a composite. A NULL composite is
-- serialized by PostgREST as {"id": null, "status": null, ...} — a TRUTHY object — so the
-- Edge Function's `if (!claimed)` never fired and every caller appeared to win. Two
-- caregivers tapping Yes wrote two logs for one pee.
-- Returning a scalar uuid makes a lost claim serialize as JSON null, which is falsy.
insert into _tap(line) select is(
  public.claim_notification('0a000000-0000-0000-0000-000000000001', 'LOG_YES', null),
  null::uuid,
  'a lost claim returns SCALAR NULL, not an all-null composite (gate 1 regression)');

insert into _tap(line) select is(
  (select status::text from public.notifications
    where id = '0a000000-0000-0000-0000-000000000001'),
  'actioned', 'the winning claim marks the row actioned');

-- A superseded notification can never be claimed: this is what makes a stale tap, arriving
-- after someone logged manually in the app, a no-op.
insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, data, scheduled_for, sent_at, status)
values ('0a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'break_prediction', 'test:claim:2',
        'Pee?', 'Did Rex go?', jsonb_build_object('breakType','pee'), now(), now(), 'superseded');

insert into _tap(line) select is(
  public.claim_notification('0a000000-0000-0000-0000-000000000002', 'LOG_YES', null),
  null::uuid,
  'a superseded notification cannot be claimed');

-- ---------------------------------------------------------------------------
-- Roll-forward — mark_break_dispatched
-- ---------------------------------------------------------------------------

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('0b000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'pee', now() - interval '1 hour',
        'aaaaaaaa-0000-0000-0000-000000000001');

select public.mark_break_dispatched('dddddddd-0000-0000-0000-0000000000a1', 'pee', null);

insert into _tap(line) select ok(
  (select notify_at > now() from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  'after dispatch, a current prediction''s notify_at moves into the future');

-- REGRESSION GUARD (migration 0013).
-- notify_at used to advance by exactly one hold from predicted_at. For a STALE prediction
-- that still landed in the past, so the row never left the due window and the dispatcher
-- retried a doomed INSERT every single minute, forever. Taking greatest(next cycle, now +
-- hold) guarantees it actually leaves.
update public.prediction_state
   set predicted_at = now() - interval '160 hours',
       notify_at    = now() - interval '160 hours'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

select public.mark_break_dispatched('dddddddd-0000-0000-0000-0000000000a1', 'pee', null);

insert into _tap(line) select ok(
  (select notify_at > now() from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  'a 160h-stale prediction also leaves the due window (roll-forward regression)');

-- predicted_at must NOT be dragged forward — the app still has to read "overdue" (Δ7).
insert into _tap(line) select ok(
  (select predicted_at < now() from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  'and predicted_at stays in the past, so the app still shows overdue (Δ7)');

-- ---------------------------------------------------------------------------
-- Quiet hours
-- ---------------------------------------------------------------------------

update public.households
   set timezone = 'UTC',
       quiet_hours_start = (now() at time zone 'UTC')::time - interval '1 hour',
       quiet_hours_end   = (now() at time zone 'UTC')::time + interval '1 hour'
 where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

insert into _tap(line) select ok(
  app.in_quiet_hours('aaaaaaaa-0000-0000-0000-0000000000a1'),
  'a window straddling the current local time reads as quiet');

update public.prediction_state set notify_at = now() - interval '1 minute'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1';

insert into _tap(line) select is(
  (select count(*)::int from public.due_break_predictions()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1'),
  0, 'break pushes are suppressed during quiet hours');

-- Medication is health-critical and must fire regardless.
insert into public.medications (id, pet_id, name, local_time, active)
values ('0c000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000a1',
        'Insulin', (now() at time zone 'UTC')::time - interval '30 seconds', true);

insert into _tap(line) select is(
  (select count(*)::int from public.due_medications()
    where medication_id = '0c000000-0000-0000-0000-000000000001'),
  1, 'medication pushes still fire during quiet hours');

update public.households set quiet_hours_start = null, quiet_hours_end = null
 where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------------------
-- Meals: don't nag for something already done
-- ---------------------------------------------------------------------------

insert into public.feed_times (id, pet_id, local_time, label, active)
values ('0d000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000a1',
        (now() at time zone 'UTC')::time - interval '30 seconds', 'Dinner', true);

insert into _tap(line) select is(
  (select count(*)::int from public.due_meals()
    where feed_time_id = '0d000000-0000-0000-0000-000000000001'),
  1, 'an unlogged meal at its slot time is due');

-- Δ1 in action: the food log points at the slot it covers.
insert into public.logs (id, household_id, pet_id, type, occurred_at, feed_time_id, created_by)
values ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'food', now(),
        '0d000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select count(*)::int from public.due_meals()
    where feed_time_id = '0d000000-0000-0000-0000-000000000001'),
  0, 'a meal already logged today is not due — no pointless nag');

-- ---------------------------------------------------------------------------
-- Appointment reminders fire once
-- ---------------------------------------------------------------------------

insert into public.appointments (id, household_id, type, title, starts_at)
values ('0f000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'vet', 'Checkup', now() + interval '1 day');
insert into public.appointment_reminders (id, appointment_id, offset_minutes, fire_at)
values ('0f000000-0000-0000-0000-000000000002', '0f000000-0000-0000-0000-000000000001',
        1440, now() - interval '1 minute');

insert into _tap(line) select is(
  (select count(*)::int from public.due_appointment_reminders()
    where reminder_id = '0f000000-0000-0000-0000-000000000002'),
  1, 'a reminder past its fire_at is due');

select public.mark_reminder_sent('0f000000-0000-0000-0000-000000000002');

insert into _tap(line) select is(
  (select count(*)::int from public.due_appointment_reminders()
    where reminder_id = '0f000000-0000-0000-0000-000000000002'),
  0, 'and drops out permanently once sent');

-- ---------------------------------------------------------------------------
-- Reconciliation safety net
-- ---------------------------------------------------------------------------

insert into _tap(line) select ok(
  app.reconcile_predictions() > 0,
  'reconcile_predictions recomputes every active pet''s predictions');

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select
  (select count(*) from _tap)                                  as tests_run,
  (select count(*) from _tap where line like 'not ok%')         as failed,
  coalesce((select string_agg(line, ' | ' order by seq)
              from _tap where line like 'not ok%'), 'ALL PASS') as failures;

rollback;
