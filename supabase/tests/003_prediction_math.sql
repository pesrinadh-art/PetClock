-- 003_prediction_math.sql
-- Parity between app.recompute_prediction() and lib/petSchedule.ts getUpcomingForPet().
--
-- If these drift, the app shows one time and the push fires at another — the single most
-- damaging bug this feature can have, and an invisible one.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- Helper: build a pet with a given hold, one feed time, and optionally one pee log.
create or replace function tests.mk_pet(
  p_id uuid, p_hold numeric, p_log_hours_ago numeric default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pets (id, household_id, name, species, pee_hold_hours, poop_hold_hours)
  values (p_id, 'aaaaaaaa-0000-0000-0000-0000000000a1', 'P' || left(p_id::text, 8),
          'dog', p_hold, p_hold);
  insert into public.feed_times (pet_id, local_time, active) values (p_id, '08:00', true);
  if p_log_hours_ago is not null then
    insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
    values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', p_id, 'pee',
            now() - make_interval(mins => (p_log_hours_ago * 60)::int),
            'aaaaaaaa-0000-0000-0000-000000000001');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Anchor and interval: predicted = last log + hold, exactly one step
-- ---------------------------------------------------------------------------

select tests.mk_pet('f0000000-0000-0000-0000-000000000001', 4, 1);

insert into _tap(line) select is(
  (select round((extract(epoch from (predicted_at - anchor_at))/3600)::numeric, 4)
     from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000001' and break_type = 'pee'),
  4.0000::numeric,
  'predicted_at is exactly one hold-interval after the anchor');

insert into _tap(line) select is(
  (select round((extract(epoch from (now() - anchor_at))/3600)::numeric, 1)
     from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000001' and break_type = 'pee'),
  1.0::numeric,
  'anchor is the most recent pee log, not the feed time');

-- ---------------------------------------------------------------------------
-- Δ7: a missed prediction STAYS PUT and reads as overdue
-- ---------------------------------------------------------------------------
-- The plan rolled forward in a loop until the prediction was in the future. That is the
-- pre-D7 behaviour the client deliberately abandoned (petSchedule.ts:112) because it
-- masks the miss. Anchor 10h ago with a 4h hold must predict 6h in the PAST.

select tests.mk_pet('f0000000-0000-0000-0000-000000000002', 4, 10);

insert into _tap(line) select ok(
  (select predicted_at < now() from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000002' and break_type = 'pee'),
  'Δ7: an overdue prediction stays in the past instead of rolling forward');

insert into _tap(line) select is(
  (select round((extract(epoch from (now() - predicted_at))/3600)::numeric, 1)
     from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000002' and break_type = 'pee'),
  6.0::numeric,
  'Δ7: and reports exactly 6h overdue (anchor 10h ago + 4h hold)');

-- ---------------------------------------------------------------------------
-- Buffer: clamp(round(hold * 60 * 0.15), 10, 45)  [bufferMsFor()]
-- ---------------------------------------------------------------------------

select tests.mk_pet('f0000000-0000-0000-0000-000000000003', 0.5, 1);   -- 4.5 -> 10 (floor)
select tests.mk_pet('f0000000-0000-0000-0000-000000000004', 2,   1);   -- 18   -> 18
select tests.mk_pet('f0000000-0000-0000-0000-000000000005', 4,   1);   -- 36   -> 36
select tests.mk_pet('f0000000-0000-0000-0000-000000000006', 6,   1);   -- 54   -> 45 (ceil)
select tests.mk_pet('f0000000-0000-0000-0000-000000000007', 24,  1);   -- 216  -> 45 (ceil)

insert into _tap(line) select is(
  (select buffer_minutes from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000003' and break_type = 'pee'),
  10, 'buffer floors at 10 min for a 0.5h hold');
insert into _tap(line) select is(
  (select buffer_minutes from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000004' and break_type = 'pee'),
  18, 'buffer is 18 min for a 2h hold');
insert into _tap(line) select is(
  (select buffer_minutes from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000005' and break_type = 'pee'),
  36, 'buffer is 36 min for a 4h hold');
insert into _tap(line) select is(
  (select buffer_minutes from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000006' and break_type = 'pee'),
  45, 'buffer ceils at 45 min for a 6h hold');
insert into _tap(line) select is(
  (select buffer_minutes from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000007' and break_type = 'pee'),
  45, 'buffer ceils at 45 min for a 24h hold');

-- notify_at is predicted_at minus exactly that buffer.
insert into _tap(line) select is(
  (select round((extract(epoch from (predicted_at - notify_at))/60)::numeric, 2)
     from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000005' and break_type = 'pee'),
  36.00::numeric, 'notify_at = predicted_at - buffer_minutes');

-- ---------------------------------------------------------------------------
-- Fallback anchor: earliest active feed time when nothing has been logged
-- ---------------------------------------------------------------------------

select tests.mk_pet('f0000000-0000-0000-0000-000000000008', 4, null);

insert into _tap(line) select is(
  (select to_char(ps.anchor_at at time zone h.timezone, 'HH24:MI')
     from prediction_state ps
     join pets p on p.id = ps.pet_id
     join households h on h.id = p.household_id
    where ps.pet_id = 'f0000000-0000-0000-0000-000000000008' and ps.break_type = 'pee'),
  '08:00', 'with no logs, the anchor is today''s earliest feed time in household-local time');

-- ---------------------------------------------------------------------------
-- hasSchedule() parity: no feed time or no hold hours => no prediction at all
-- ---------------------------------------------------------------------------

insert into public.pets (id, household_id, name, species, pee_hold_hours, poop_hold_hours)
values ('f0000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'NoFeed', 'dog', 4, 4);

insert into _tap(line) select is(
  (select count(*)::int from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-000000000009'),
  0, 'a pet with hold hours but no feed time gets no prediction (mirrors hasSchedule)');

insert into public.pets (id, household_id, name, species)
values ('f0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'NoHold', 'dog');
insert into public.feed_times (pet_id, local_time, active)
values ('f0000000-0000-0000-0000-00000000000a', '08:00', true);

insert into _tap(line) select is(
  (select count(*)::int from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-00000000000a'),
  0, 'a pet with feed times but no hold hours gets no prediction');

-- Setting hold hours later must create the prediction (trg_pets_schedule_change).
update public.pets set pee_hold_hours = 3, poop_hold_hours = 3
 where id = 'f0000000-0000-0000-0000-00000000000a';

insert into _tap(line) select is(
  (select count(*)::int from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-00000000000a'),
  2, 'setting hold hours creates both break predictions');

-- ---------------------------------------------------------------------------
-- Undo: soft-deleting the anchor log must re-anchor
-- ---------------------------------------------------------------------------
-- Without this, a mis-tapped log that the user undid keeps suppressing the real reminder.

select tests.mk_pet('f0000000-0000-0000-0000-00000000000b', 4, null);
insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('f1000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'f0000000-0000-0000-0000-00000000000b', 'pee', now() - interval '1 hour',
        'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select last_log_id from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-00000000000b' and break_type = 'pee'),
  'f1000000-0000-0000-0000-00000000000b'::uuid,
  'the new log becomes the anchor');

update public.logs set deleted_at = now()
 where id = 'f1000000-0000-0000-0000-00000000000b';

insert into _tap(line) select is(
  (select last_log_id from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-00000000000b' and break_type = 'pee'),
  null::uuid,
  'undoing that log re-anchors back to the feed time');

-- ---------------------------------------------------------------------------
-- A fresh log clears a snooze and resets the "not yet" streak
-- ---------------------------------------------------------------------------

select tests.mk_pet('f0000000-0000-0000-0000-00000000000c', 4, 2);
update public.prediction_state
   set snoozed_until = now() + interval '15 minutes', consecutive_no_count = 2
 where pet_id = 'f0000000-0000-0000-0000-00000000000c' and break_type = 'pee';

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'f0000000-0000-0000-0000-00000000000c', 'pee', now(),
        'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select snoozed_until from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-00000000000c' and break_type = 'pee'),
  null::timestamptz, 'a new log clears any active snooze');

insert into _tap(line) select is(
  (select consecutive_no_count from prediction_state
    where pet_id = 'f0000000-0000-0000-0000-00000000000c' and break_type = 'pee'),
  0, 'a new log resets the consecutive "not yet" streak');

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select
  (select count(*) from _tap)                                  as tests_run,
  (select count(*) from _tap where line like 'not ok%')         as failed,
  coalesce((select string_agg(line, ' | ' order by seq)
              from _tap where line like 'not ok%'), 'ALL PASS') as failures;

rollback;
