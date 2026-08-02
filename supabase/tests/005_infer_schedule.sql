-- 005_infer_schedule.sql
-- Server-side port of inferScheduleFromLogs() (lib/petSchedule.ts:401).
--
-- This is what fulfils the calibration promise — "log a few pees, poos and meals and we'll
-- start predicting". Getting the rounding wrong produces a schedule that is subtly wrong
-- forever, since the suggestion is usually accepted as-is.
--
-- Exact parity with the client is impossible by design (Δ8): the server infers from ALL
-- caregivers' logs, which is the entire reason inference moved server-side, and no single
-- client ever sees that set. What must hold is the confidence gate and the arithmetic.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- Builds a pet whose pee/poo logs sit at exact hourly gaps, plus food logs at a fixed
-- local clock time across N days.
create or replace function tests.mk_history(
  p_id uuid, p_pee_gaps numeric[], p_poo_gaps numeric[],
  p_food_days int default 0, p_food_hour int default 8
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_tz  text;
  v_acc numeric;
  g     numeric;
  i     int;
begin
  select h.timezone into v_tz from public.households h
   where h.id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

  insert into public.pets (id, household_id, name, species)
  values (p_id, 'aaaaaaaa-0000-0000-0000-0000000000a1', 'H' || left(p_id::text, 8), 'dog');

  -- Walk backwards from 1h ago, so every log is in the past and gaps are exact.
  v_acc := 1;
  insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', p_id, 'pee',
          now() - make_interval(mins => (v_acc * 60)::int),
          'aaaaaaaa-0000-0000-0000-000000000001');
  foreach g in array coalesce(p_pee_gaps, '{}'::numeric[]) loop
    v_acc := v_acc + g;
    insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
    values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', p_id, 'pee',
            now() - make_interval(mins => (v_acc * 60)::int),
            'aaaaaaaa-0000-0000-0000-000000000001');
  end loop;

  v_acc := 2;
  insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', p_id, 'poo',
          now() - make_interval(mins => (v_acc * 60)::int),
          'aaaaaaaa-0000-0000-0000-000000000001');
  foreach g in array coalesce(p_poo_gaps, '{}'::numeric[]) loop
    v_acc := v_acc + g;
    insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
    values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', p_id, 'poo',
            now() - make_interval(mins => (v_acc * 60)::int),
            'aaaaaaaa-0000-0000-0000-000000000001');
  end loop;

  for i in 1..p_food_days loop
    insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
    values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', p_id, 'food',
            (date_trunc('day', now() at time zone v_tz)
               - make_interval(days => i)
               + make_interval(hours => p_food_hour)) at time zone v_tz,
            'aaaaaaaa-0000-0000-0000-000000000001');
  end loop;
end $$;

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- The confidence gate: all three pieces, or nothing at all
-- ---------------------------------------------------------------------------

select tests.become_service();
select tests.mk_history('c0000000-0000-0000-0000-000000000001', '{}', '{}', 0);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select ok(
  public.infer_schedule('c0000000-0000-0000-0000-000000000001') is null,
  'one pee and one poo log (no gaps, no food) infers nothing');

select tests.become_service();
select tests.mk_history('c0000000-0000-0000-0000-000000000002', '{4}', '{6}', 0);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select ok(
  public.infer_schedule('c0000000-0000-0000-0000-000000000002') is null,
  'enough pee/poo history but no food logs still infers nothing');

-- ---------------------------------------------------------------------------
-- Happy path
-- ---------------------------------------------------------------------------

select tests.become_service();
select tests.mk_history('c0000000-0000-0000-0000-000000000003', '{4,4}', '{6,6}', 2, 8);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select ok(
  public.infer_schedule('c0000000-0000-0000-0000-000000000003') is not null,
  'two pee gaps, two poo gaps and food logs infer a schedule');

insert into _tap(line) select is(
  (public.infer_schedule('c0000000-0000-0000-0000-000000000003')->>'peeHoldHours')::numeric,
  4.0::numeric, 'consistent 4h pee gaps infer a 4h hold');

insert into _tap(line) select is(
  (public.infer_schedule('c0000000-0000-0000-0000-000000000003')->>'poopHoldHours')::numeric,
  6.0::numeric, 'consistent 6h poo gaps infer a 6h hold');

insert into _tap(line) select is(
  (public.infer_schedule('c0000000-0000-0000-0000-000000000003')->'feedTimes'->>0),
  '08:00', 'food logged at 08:00 local on two days infers an 08:00 feed time');

-- ---------------------------------------------------------------------------
-- Rounding: nearest half hour, floored at 1h  [averageIntervalHours]
-- ---------------------------------------------------------------------------

select tests.become_service();
-- mean 2.3h -> 2.3*2 = 4.6 -> round 5 -> 2.5
select tests.mk_history('c0000000-0000-0000-0000-000000000004', '{2.2,2.4}', '{6,6}', 2, 8);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (public.infer_schedule('c0000000-0000-0000-0000-000000000004')->>'peeHoldHours')::numeric,
  2.5::numeric, 'a 2.3h mean rounds to the nearest half hour (2.5)');

select tests.become_service();
-- mean 0.25h would round to 0.5, but the floor lifts it to 1
select tests.mk_history('c0000000-0000-0000-0000-000000000005', '{0.2,0.3}', '{6,6}', 2, 8);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (public.infer_schedule('c0000000-0000-0000-0000-000000000005')->>'peeHoldHours')::numeric,
  1.0::numeric, 'a sub-hour mean is floored to a 1h hold');

-- ---------------------------------------------------------------------------
-- Overnight gaps are not "holds" and must be excluded (> 12h)
-- ---------------------------------------------------------------------------
-- Without this filter, one overnight stretch drags the whole average up and the pet gets
-- reminded far too rarely.

select tests.become_service();
select tests.mk_history('c0000000-0000-0000-0000-000000000006', '{4,14,4}', '{6,6}', 2, 8);
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (public.infer_schedule('c0000000-0000-0000-0000-000000000006')->>'peeHoldHours')::numeric,
  4.0::numeric, 'a 14h overnight gap is excluded, leaving the 4h hold intact');

-- ---------------------------------------------------------------------------
-- Authorization: inference reads another household's logs only for members
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');   -- carol, household B
insert into _tap(line) select throws_ok(
  $$ select public.infer_schedule('c0000000-0000-0000-0000-000000000003') $$,
  'P0001', 'FORBIDDEN',
  'a non-member cannot infer a schedule from another household''s logs');

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
