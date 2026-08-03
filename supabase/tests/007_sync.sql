-- 007_sync.sql
-- BE-2: the sync cursor, tombstone delivery, and realtime configuration.
--
-- Realtime delivery itself cannot be tested from SQL — it needs a websocket client, and is
-- covered separately by a live three-user test. What IS testable here is everything the
-- delivery depends on: that the cursor moves when it should, that deleted rows keep
-- flowing, and that the publication is actually configured.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- ---------------------------------------------------------------------------
-- Publication and replica identity
-- ---------------------------------------------------------------------------
-- The publication was empty before this migration, which meant realtime could never have
-- delivered anything to anyone. Worth a permanent guard.

insert into _tap(line) select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('pets','feed_times','medications','logs','appointments')),
  5, 'all five synced tables are in the realtime publication');

-- Default replica identity ships only the primary key on UPDATE/DELETE, which leaves
-- Realtime unable to evaluate RLS against the old row.
insert into _tap(line) select ok(
  (select bool_and(relreplident = 'f') from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
      and relname in ('pets','feed_times','medications','logs','appointments')),
  'synced tables use replica identity FULL');

-- Deliberately excluded: prediction_state churns on every log and every dispatch, and the
-- client derives the same value locally. notifications carries the idempotency spine and
-- notification_tokens is PII — neither belongs on a broadcast channel.
insert into _tap(line) select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename in ('prediction_state','notifications','notification_tokens')),
  0, 'prediction_state, notifications and tokens are NOT published');

-- ---------------------------------------------------------------------------
-- The cursor moves on every kind of mutation
-- ---------------------------------------------------------------------------

insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by)
values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'dddddddd-0000-0000-0000-0000000000a1', 'pee', now(),
        'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select ok(
  (select updated_at is not null from public.logs
    where id = 'a1000000-0000-0000-0000-000000000001'),
  'a new log gets an updated_at cursor value');

-- THE REASON logs needed updated_at at all.
-- logs is append-only, so it only had created_at — but a soft delete changes deleted_at
-- WITHOUT touching created_at. A created_at cursor would skip every undo, and an undone
-- log would live forever on every other device.
update public.logs set updated_at = now() - interval '1 hour'
 where id = 'a1000000-0000-0000-0000-000000000001';

update public.logs set deleted_at = now()
 where id = 'a1000000-0000-0000-0000-000000000001';

insert into _tap(line) select ok(
  (select updated_at > now() - interval '1 minute' from public.logs
    where id = 'a1000000-0000-0000-0000-000000000001'),
  'a soft delete ADVANCES the cursor (created_at alone would have missed it)');

-- ---------------------------------------------------------------------------
-- Children surface through their parent
-- ---------------------------------------------------------------------------
-- appointment_pets and appointment_reminders carry no cursor of their own. Touching the
-- parent is what makes a child change visible to both realtime and the delta pull.

insert into public.appointments (id, household_id, type, title, starts_at)
values ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'vet', 'Cursor Test', now() + interval '5 days');

update public.appointments set updated_at = now() - interval '1 hour'
 where id = 'a2000000-0000-0000-0000-000000000001';

insert into public.appointment_pets (appointment_id, pet_id)
values ('a2000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000a1');

insert into _tap(line) select ok(
  (select updated_at > now() - interval '1 minute' from public.appointments
    where id = 'a2000000-0000-0000-0000-000000000001'),
  'attaching a pet touches the parent appointment''s cursor');

update public.appointments set updated_at = now() - interval '1 hour'
 where id = 'a2000000-0000-0000-0000-000000000001';

insert into public.appointment_reminders (appointment_id, offset_minutes, fire_at)
values ('a2000000-0000-0000-0000-000000000001', 1440, now() + interval '4 days');

insert into _tap(line) select ok(
  (select updated_at > now() - interval '1 minute' from public.appointments
    where id = 'a2000000-0000-0000-0000-000000000001'),
  'adding a reminder touches the parent appointment''s cursor');

-- ---------------------------------------------------------------------------
-- pull_changes
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');   -- alice, household A

insert into _tap(line) select ok(
  (public.pull_changes('-infinity'::timestamptz)->>'serverTime') is not null,
  'pull_changes returns a server-clock cursor');

-- Server clock, never the device's: a phone with a skewed clock would otherwise skip or
-- replay changes on every sync.
insert into _tap(line) select ok(
  (public.pull_changes('-infinity'::timestamptz)->>'serverTime')::timestamptz
    between now() - interval '1 minute' and now() + interval '1 minute',
  'and that cursor is the server''s clock');

insert into _tap(line) select ok(
  jsonb_array_length(public.pull_changes('-infinity'::timestamptz)->'pets') > 0,
  'a full pull returns the household''s pets');

-- Tombstones must be INCLUDED. Filtering them would strand deleted rows on every device
-- that was offline when the delete happened.
insert into _tap(line) select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.pull_changes('-infinity'::timestamptz)->'logs') l
     where l->>'id' = 'a1000000-0000-0000-0000-000000000001'
       and l->>'deleted_at' is not null),
  'a full pull INCLUDES soft-deleted rows as tombstones');

insert into _tap(line) select is(
  jsonb_array_length(public.pull_changes(now() + interval '1 minute')->'logs'),
  0, 'a future cursor returns nothing');

-- Appointments arrive whole, with children attached, matching the client model.
insert into _tap(line) select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.pull_changes('-infinity'::timestamptz)->'appointments') a
     where a->>'id' = 'a2000000-0000-0000-0000-000000000001'
       and jsonb_array_length(a->'pet_ids') = 1
       and jsonb_array_length(a->'reminder_offsets_minutes') = 1),
  'appointments come back with pet_ids and reminder offsets attached');

-- ---------------------------------------------------------------------------
-- pull_changes is RLS-scoped
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER is load-bearing here. A DEFINER version would hand every caller every
-- household's data in a single call.

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');   -- carol, household B

insert into _tap(line) select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.pull_changes('-infinity'::timestamptz)->'logs') l
     where l->>'id' = 'a1000000-0000-0000-0000-000000000001'),
  'a different household''s pull cannot see household A''s logs');

insert into _tap(line) select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.pull_changes('-infinity'::timestamptz)->'pets') p
     where p->>'id' = 'dddddddd-0000-0000-0000-0000000000a1'),
  'nor its pets');

-- ---------------------------------------------------------------------------
-- my_household_id
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');   -- bob, member of A

insert into _tap(line) select is(
  public.my_household_id(), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'my_household_id resolves the caller''s household for channel naming');

-- An expired walker is not a member, so they get no channel to subscribe to.
-- tests.seed_fixtures() only creates alice, bob and carol, so the walker is made here.
select tests.become_service();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'walker@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Walker"}', '', '', '', '')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role, member_expires_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000004',
        'walker', now() - interval '1 minute')
on conflict (household_id, user_id) do update set member_expires_at = now() - interval '1 minute';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');
insert into _tap(line) select is(
  public.my_household_id(), null::uuid,
  'an expired walker resolves to no household');

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
