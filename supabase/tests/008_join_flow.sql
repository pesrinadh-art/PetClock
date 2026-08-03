-- 008_join_flow.sql
-- The second phone. `leave_household` and `join_household` (migration 0016) are what make
-- "two devices, one household" reachable — before them a redeem left the caller in two
-- households with the auto-created empty one winning `my_household_id()`.
--
-- Both RPCs are SECURITY DEFINER, so RLS is bypassed inside and every authorization
-- decision is hand-written. That is exactly the code worth testing directly.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- Dave is the "second phone": a fresh anonymous user with no household yet.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'dave@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Dave"}', '', '', '', '')
on conflict (id) do nothing;

select tests.become_service();
insert into public.household_invites (id, household_id, code, role, created_by, expires_at, max_uses)
values ('cafe0000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'JOIN01', 'member', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5),
       ('cafe0000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'JOIN02', 'member', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5);

-- ---------------------------------------------------------------------------
-- The bug 0016 exists to fix: joined_at ordering makes the auto-created household win
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');

-- Reproduce first launch exactly: the app creates a household before anyone types a code.
insert into _tap(line) select ok(
  public.create_household_with_membership('Dave Phone', 'Europe/London') is not null,
  'second phone auto-creates its own household at first launch');

-- ...then the user redeems. WITHOUT the leave, my_household_id() still points at the empty
-- one, because it resolves `order by joined_at limit 1` and that membership came first.
insert into _tap(line) select is(
  public.redeem_invite('JOIN01'), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'a bare redeem_invite does join House A');

insert into _tap(line) select is(
  (select count(*)::int from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  2, 'but the caller is now in TWO households');

insert into _tap(line) select isnt(
  public.my_household_id(), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'and my_household_id() still resolves to the WRONG one — the regression 0016 fixes');

-- ---------------------------------------------------------------------------
-- leave_household — the happy path
-- ---------------------------------------------------------------------------

insert into _tap(line) select lives_ok(
  format($$ select public.leave_household(%L) $$,
         (select household_id from public.household_members
           where user_id = 'aaaaaaaa-0000-0000-0000-000000000004'
             and household_id <> 'aaaaaaaa-0000-0000-0000-0000000000a1')),
  'the last owner of an EMPTY household may leave it');

insert into _tap(line) select is(
  public.my_household_id(), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'after leaving, resolution is unambiguous — House A');

select tests.become_service();
insert into _tap(line) select is(
  (select count(*)::int from public.households where name = 'Dave Phone'),
  0, 'the emptied household is garbage-collected, not left as an orphan row');

-- ---------------------------------------------------------------------------
-- The guard: an owner may not strand pets
-- ---------------------------------------------------------------------------
-- Membership is the ONLY route to a row under RLS. An owner walking out of a household
-- that still holds pets makes them unreachable by anyone, forever, with no admin view.

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select throws_ok(
  $$ select public.leave_household('aaaaaaaa-0000-0000-0000-0000000000a1') $$,
  'P0001', 'LAST_OWNER_HAS_PETS',
  'the last owner of a household holding pets is refused');

-- Carol owns House B alone, with one pet. Archiving it clears the pet guard but she still
-- has no co-members, so this proves the two guards are independent.
select tests.become_service();
update public.pets set archived_at = now()
 where id = 'dddddddd-0000-0000-0000-0000000000b1';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
insert into _tap(line) select lives_ok(
  $$ select public.leave_household('aaaaaaaa-0000-0000-0000-0000000000b1') $$,
  'an archived pet does not count — its owner may leave');

-- Bob is a plain member of House A, which is full of pets. He is not the last owner, so
-- nothing is stranded by his leaving.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');
insert into _tap(line) select lives_ok(
  $$ select public.leave_household('aaaaaaaa-0000-0000-0000-0000000000a1') $$,
  'a non-owner may always leave, pets or not');

select tests.become_service();
insert into _tap(line) select is(
  (select count(*)::int from public.households
    where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  1, 'a household with members remaining is NOT deleted');

-- Non-membership and anonymity
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');
insert into _tap(line) select throws_ok(
  $$ select public.leave_household('aaaaaaaa-0000-0000-0000-0000000000a1') $$,
  'P0001', 'NOT_A_MEMBER',
  'leaving a household you are not in is refused');

-- 42501, not P0001: the revoked grant stops anon before the body's NOT_AUTHENTICATED check
-- ever runs. That check stays as defence in depth if the grants are ever loosened.
select tests.logout();
insert into _tap(line) select throws_ok(
  $$ select public.leave_household('aaaaaaaa-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'an anonymous caller cannot even reach leave_household');

-- ---------------------------------------------------------------------------
-- join_household — redeem and leave as one step
-- ---------------------------------------------------------------------------

select tests.become_service();
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'erin@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Erin"}', '', '', '', '')
on conflict (id) do nothing;

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000005');

-- Erin walks the real second-phone path in one call.
create temp table _erin_own on commit drop as
  select public.create_household_with_membership('Erin Phone', 'Europe/London') as id;
grant all on _erin_own to public;

create temp table _erin_join on commit drop as
  select public.join_household('JOIN02', (select id from _erin_own)) as res;
grant all on _erin_join to public;

insert into _tap(line) select is(
  (select (res ->> 'householdId')::uuid from _erin_join),
  'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'join_household returns the joined household id');

insert into _tap(line) select is(
  (select (res ->> 'leftPrevious')::boolean from _erin_join),
  true, 'and reports that the auto-created household was left');

insert into _tap(line) select is(
  (select count(*)::int from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  1, 'exactly ONE membership remains — the ambiguity is gone');

insert into _tap(line) select is(
  public.my_household_id(), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'my_household_id() resolves to the joined household with no cache involved');

-- jsonb, not a composite. A NULL composite serialises through PostgREST as a *truthy*
-- {"id": null} object — the exact trap that silently disabled idempotency gate 1 until 0014.
insert into _tap(line) select is(
  (select jsonb_typeof(res) from _erin_join), 'object',
  'the return is jsonb, avoiding the NULL-composite serialisation trap');

-- ---------------------------------------------------------------------------
-- A failed leave must not roll back the join
-- ---------------------------------------------------------------------------
-- Frank owns a household holding a pet, so leaving it is refused. Joining must still
-- succeed: losing the join over a housekeeping step is the worse outcome by far.

select tests.become_service();
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'frank@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Frank"}', '', '', '', '')
on conflict (id) do nothing;

insert into public.household_invites (id, household_id, code, role, created_by, expires_at, max_uses)
values ('cafe0000-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'JOIN03', 'member', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000006');

create temp table _frank_own on commit drop as
  select public.create_household_with_membership('Frank House', 'Europe/London') as id;
grant all on _frank_own to public;

select tests.become_service();
insert into public.pets (id, household_id, name, species, pee_hold_hours, poop_hold_hours)
select 'dddddddd-0000-0000-0000-0000000000f1', id, 'Bruno', 'dog', 4, 6 from _frank_own;

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000006');

create temp table _frank_join on commit drop as
  select public.join_household('JOIN03', (select id from _frank_own)) as res;
grant all on _frank_join to public;

insert into _tap(line) select is(
  (select (res ->> 'householdId')::uuid from _frank_join),
  'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'the join still succeeds when the leave is refused');

insert into _tap(line) select is(
  (select (res ->> 'leftPrevious')::boolean from _frank_join),
  false, 'and it honestly reports that the previous household was kept');

insert into _tap(line) select is(
  (select count(*)::int from public.pets
    where id = 'dddddddd-0000-0000-0000-0000000000f1'),
  1, 'Bruno is still reachable — nothing was stranded');

-- ---------------------------------------------------------------------------
-- Grants: anon must not reach either RPC
-- ---------------------------------------------------------------------------

select tests.logout();
insert into _tap(line) select throws_ok(
  $$ select public.join_household('JOIN01', null) $$,
  '42501', null, 'anon has no execute grant on join_household');

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
