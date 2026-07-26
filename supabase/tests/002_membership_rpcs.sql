-- 002_membership_rpcs.sql
-- The only two paths allowed to create membership, plus the invite abuse controls.
-- These RPCs are SECURITY DEFINER, so they run with RLS bypassed — every authorization
-- decision inside them is hand-written and therefore worth testing directly.

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- A fourth user with no household at all, for bootstrap and redemption tests.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'dave@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Dave"}', '', '', '', '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Household bootstrap — the anonymous user's very first action
-- ---------------------------------------------------------------------------

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');

insert into _tap(line) select ok(
  public.create_household_with_membership('Dave House', 'Europe/London') is not null,
  'create_household_with_membership returns a household id');

select tests.become_service();

insert into _tap(line) select is(
  (select count(*)::int from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000004' and role = 'owner'),
  1, 'the creator is enrolled as owner in the same call');

insert into _tap(line) select is(
  (select timezone from public.households where name = 'Dave House'),
  'Europe/London', 'the supplied timezone is stored');

-- Δ5: timezone is validated by trigger, so a bad IANA name is refused up front rather
-- than blowing up later inside a scheduling query.
insert into _tap(line) select throws_ok(
  $$ insert into public.households (name, timezone) values ('Bad', 'Mars/Olympus_Mons') $$,
  'P0001', null, 'an invalid IANA timezone is rejected at write time');

-- ---------------------------------------------------------------------------
-- Invites: happy path
-- ---------------------------------------------------------------------------

select tests.become_service();
insert into public.household_invites (id, household_id, code, role, created_by, expires_at, max_uses)
values ('cafe0000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'GOOD01', 'member', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');

insert into _tap(line) select is(
  public.redeem_invite('GOOD01'), 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'a valid code returns the household id');

select tests.become_service();
insert into _tap(line) select is(
  (select count(*)::int from public.household_members
    where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  1, 'and enrols the redeemer as a member');

insert into _tap(line) select is(
  (select use_count from public.household_invites
    where id = 'cafe0000-0000-0000-0000-000000000001'),
  1, 'and increments use_count exactly once');

-- Codes are matched case-insensitively and trimmed, since they get typed by hand.
insert into public.household_invites (household_id, code, created_by, expires_at, max_uses)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'CASE01',
        'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '7 days', 5);

-- Back to a signed-in caller: redeem_invite needs auth.uid(), and the use_count assertion
-- above left us in service context.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');
insert into _tap(line) select lives_ok(
  $$ select public.redeem_invite('  case01  ') $$,
  'codes are upper-cased and trimmed before lookup');

-- ---------------------------------------------------------------------------
-- Invites: every rejection path
-- ---------------------------------------------------------------------------

select tests.become_service();
insert into public.household_invites (household_id, code, created_by, expires_at, max_uses)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'EXPIR1',
        'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day', 5);
insert into public.household_invites (household_id, code, created_by, expires_at, max_uses, revoked_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'REVOK1',
        'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '7 days', 5, now());
insert into public.household_invites (household_id, code, created_by, expires_at, max_uses, use_count)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'USEDUP',
        'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '7 days', 2, 2);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');

insert into _tap(line) select throws_ok(
  $$ select public.redeem_invite('NOSUCH') $$, 'P0001', 'INVITE_INVALID',
  'an unknown code is refused');
insert into _tap(line) select throws_ok(
  $$ select public.redeem_invite('EXPIR1') $$, 'P0001', 'INVITE_INVALID',
  'an expired code is refused');
insert into _tap(line) select throws_ok(
  $$ select public.redeem_invite('REVOK1') $$, 'P0001', 'INVITE_INVALID',
  'a revoked code is refused');
insert into _tap(line) select throws_ok(
  $$ select public.redeem_invite('USEDUP') $$, 'P0001', 'INVITE_INVALID',
  'a code at max_uses is refused');

-- ---------------------------------------------------------------------------
-- Invite creation is members-only, and walker invites are owners-only
-- ---------------------------------------------------------------------------
-- A walker invite grants log-write access to someone outside the household, so it is a
-- strictly higher privilege than inviting a co-owner's device.

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');   -- bob: member
insert into _tap(line) select lives_ok(
  $$ select public.create_invite('member') $$,
  'a plain member can create a member invite');

insert into _tap(line) select throws_ok(
  $$ select public.create_invite('walker') $$, 'P0001', 'OWNER_REQUIRED',
  'a plain member cannot create a walker invite');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');   -- alice: owner
insert into _tap(line) select lives_ok(
  $$ select public.create_invite('walker') $$,
  'an owner can create a walker invite');

-- ---------------------------------------------------------------------------
-- Walker access is time-boxed, and app.is_member honours the expiry
-- ---------------------------------------------------------------------------

select tests.become_service();
insert into public.household_invites (household_id, code, role, created_by, expires_at, max_uses)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'WALK01', 'walker',
        'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '7 days', 5);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select public.redeem_invite('WALK01');
select tests.become_service();

insert into _tap(line) select ok(
  (select member_expires_at is not null from public.household_members
    where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'a redeemed walker invite sets member_expires_at');

-- Asserted through RLS rather than by calling app.is_member() directly: the `app` schema
-- is deliberately unreachable from `authenticated` (0001), and RLS policies can call into
-- it only because policy expressions execute as the table owner. Testing the observable
-- behaviour is the better check regardless.

-- While the window is open the walker can read, but not edit.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
insert into _tap(line) select is(
  (select count(*)::int from public.pets
    where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  1, 'an unexpired walker can see the household''s pets');

insert into _tap(line) select lives_ok(
  $$ update public.pets set name = 'WalkerEdit'
      where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' $$,
  'a walker''s edit attempt runs without error');

select tests.become_service();
insert into _tap(line) select is(
  (select name from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1'), 'Rex',
  'but changes nothing — a walker is a member, never an editor');

-- ...and once it lapses, they are nobody.
update public.household_members set member_expires_at = now() - interval '1 minute'
 where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
   and user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
insert into _tap(line) select is(
  (select count(*)::int from public.pets
    where household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  0, 'an expired walker can no longer see anything in that household');

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
