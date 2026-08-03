-- 009_review_fixes.sql
-- Regression guards for migration 0017.
--
-- Every assertion here corresponds to a defect that was *observed on the live staging
-- project*, not one that was reasoned about. Two of them (sections 1 and 2) were invisible
-- in normal operation: the first because a missing REVOKE looks identical to a present one
-- until someone calls the function, the second because the dispatcher counts a suppressed
-- re-ask as `skipped`, which is also the correct outcome of a replayed tick.
--
-- Several tests deliberately run as the LOGIN role with only the JWT claim set, rather than
-- via tests.authenticate_as(). That separates the two independent layers: the EXECUTE grant
-- (which stops a client reaching the function at all) and the in-body authorization check
-- (which is what still holds if a future `create or replace` drops the grant again — the
-- precise way 0007's hole was introduced).

begin;

create temp table _tap (seq serial primary key, line text) on commit drop;
grant all on _tap to public;
grant all on sequence _tap_seq_seq to public;
select * from no_plan();
select tests.seed_fixtures();

-- Shorthands used throughout.
--   House A  aaaaaaaa-…a1   alice …01 (owner), bob …02 (member)
--   House B  aaaaaaaa-…b1   carol …03 (owner)
--   Rex      dddddddd-…a1   in House A

-- ---------------------------------------------------------------------------
-- 1. record_break_no was reachable by ANY authenticated user, for ANY pet
-- ---------------------------------------------------------------------------
-- 0007's revoke block ends `from public, anon` and omits `authenticated`, and Supabase's
-- default privileges had already granted EXECUTE to `authenticated` on creation. Observed:
-- a brand-new anonymous user, member of nothing, moved a stranger's notify_at and drove up
-- consecutive_no_count — the input to hold-time recalibration.

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');
insert into _tap(line) select throws_ok(
  $$ select public.record_break_no('dddddddd-0000-0000-0000-0000000000a1', 'pee') $$,
  '42501', null,
  'record_break_no is unreachable by authenticated — even for a member of the household');

-- Layer two, with the grant taken out of the picture: carol owns House B and is not a
-- member of House A, so the function must refuse her by inspecting membership itself.
select tests.become_service();
select set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003',
                                    'role', 'authenticated')::text, true);

insert into _tap(line) select throws_ok(
  $$ select public.record_break_no('dddddddd-0000-0000-0000-0000000000a1', 'pee') $$,
  'P0001', 'FORBIDDEN',
  'and it refuses a non-member on its own, independently of the grant');

-- The real caller. log-action runs as service_role, which carries no `sub` claim, so
-- auth.uid() is null and the membership check is correctly skipped.
select set_config('request.jwt.claims', null, true);

insert into _tap(line) select lives_ok(
  $$ select public.record_break_no('dddddddd-0000-0000-0000-0000000000a1', 'pee') $$,
  'the Edge Function path (no auth.uid()) still works');

insert into _tap(line) select is(
  (select consecutive_no_count from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  1, 'and it did what it is for — the LOG_NO streak advanced');

-- ---------------------------------------------------------------------------
-- 2. "Not yet" and "Snooze 15" could never produce a second push
-- ---------------------------------------------------------------------------
-- dedupe_key is pinned to predicted_at, and BOTH re-ask paths deliberately leave
-- predicted_at alone (Δ7 — a missed break must keep reading "overdue"). So the re-ask
-- regenerated an IDENTICAL key, the dispatcher's INSERT hit the unique constraint, and the
-- item was counted as `skipped`. The state was written; the notification never existed.

select tests.become_service();

-- Make Rex's pee prediction observably due. Quiet hours are null in the fixtures.
update public.prediction_state
   set predicted_at  = timestamptz '2026-01-01 18:00:00+00',
       notify_at     = now() - interval '1 minute',
       snoozed_until = null,
       reask_seq     = 0
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

create temp table _k1 on commit drop as
  select dedupe_key as k from public.due_break_predictions()
   where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

insert into _tap(line) select is(
  (select count(*)::int from _k1), 1, 'the prediction is due and produces one dedupe key');

insert into _tap(line) select ok(
  (select k not like '%:r%' from _k1),
  'the first send uses the ORIGINAL key shape — 0017 must not re-key anything already sent');

-- The user taps "Not yet". notify_at moves 20 minutes out; predicted_at must not.
select public.record_break_no('dddddddd-0000-0000-0000-0000000000a1', 'pee');

insert into _tap(line) select is(
  (select predicted_at from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  timestamptz '2026-01-01 18:00:00+00',
  'predicted_at is untouched by the re-ask — Δ7, the break still reads as overdue');

-- Twenty minutes later, from the dispatcher's point of view.
update public.prediction_state set notify_at = now() - interval '1 minute'
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

create temp table _k2 on commit drop as
  select dedupe_key as k from public.due_break_predictions()
   where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

insert into _tap(line) select isnt(
  (select k from _k2), (select k from _k1),
  'the LOG_NO re-ask now mints a DIFFERENT key — this is the P0');

insert into _tap(line) select ok(
  (select k like '%:r1' from _k2),
  'and the suffix names the re-ask it belongs to');

-- The same must hold for a snooze, which re-arms on a different timer.
select public.snooze_break('dddddddd-0000-0000-0000-0000000000a1', 'pee',
                           gen_random_uuid(), 15);

update public.prediction_state
   set notify_at = now() - interval '1 minute', snoozed_until = null
 where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

create temp table _k3 on commit drop as
  select dedupe_key as k from public.due_break_predictions()
   where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee';

insert into _tap(line) select ok(
  (select k like '%:r2' from _k3),
  'a snooze re-arm is likewise a new key, so "Snooze 15" can actually fire');

-- Exactly-once still holds: re-reading the same state must not invent a third key.
insert into _tap(line) select is(
  (select dedupe_key from public.due_break_predictions()
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  (select k from _k3),
  'and the key is stable while the state is — one re-ask, one push, not a nag loop');

-- A genuine log re-anchors the cycle, so the re-ask chain must restart. Without this the
-- ':rN' suffix would grow without bound and leak across cycles forever.
insert into public.logs (id, household_id, pet_id, type, occurred_at, source, created_by)
values ('beef0000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a1',
        'pee', now(), 'manual', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into _tap(line) select is(
  (select reask_seq from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  0, 'a new log resets reask_seq — the next cycle starts from the plain key again');

insert into _tap(line) select is(
  (select consecutive_no_count from public.prediction_state
    where pet_id = 'dddddddd-0000-0000-0000-0000000000a1' and break_type = 'pee'),
  0, 'and resets the LOG_NO streak on the same condition, as it always did');

-- ---------------------------------------------------------------------------
-- 3. Logs were not immutable
-- ---------------------------------------------------------------------------
-- 0006's logs_update policy is `using (is_member) with check (is_member)` with no column
-- restriction, and RLS cannot express one. Its comment claims "soft-delete and note edits
-- only"; nothing enforced that. Observed: a time-boxed WALKER retyped an existing pee log
-- as 'food', backdated it to 2019, and reassigned created_by to themselves.

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');

insert into _tap(line) select lives_ok(
  $$ update public.logs set note = 'edited by bob'
      where id = 'beef0000-0000-0000-0000-000000000001' $$,
  'a member may still edit a log note');

insert into _tap(line) select lives_ok(
  $$ update public.logs set deleted_at = now()
      where id = 'beef0000-0000-0000-0000-000000000001' $$,
  'and may still soft-delete — the undo window is untouched');

insert into _tap(line) select throws_ok(
  $$ update public.logs set occurred_at = timestamptz '2019-06-06 12:00:00+00'
      where id = 'beef0000-0000-0000-0000-000000000001' $$,
  'P0001', 'LOG_IMMUTABLE: only note and deleted_at may be updated on a log',
  'but rewriting occurred_at is refused — it is the prediction anchor');

insert into _tap(line) select throws_ok(
  $$ update public.logs set type = 'food'
      where id = 'beef0000-0000-0000-0000-000000000001' $$,
  'P0001', 'LOG_IMMUTABLE: only note and deleted_at may be updated on a log',
  'retyping a log is refused');

insert into _tap(line) select throws_ok(
  $$ update public.logs set created_by = 'aaaaaaaa-0000-0000-0000-000000000002'
      where id = 'beef0000-0000-0000-0000-000000000001' $$,
  'P0001', 'LOG_IMMUTABLE: only note and deleted_at may be updated on a log',
  'and reassigning authorship is refused — logs are the audit trail between caregivers');

-- The guard names the CLIENT roles rather than exempting service_role, so `postgres` keeps
-- working. A guard that also blocked every future migration and admin correction would be
-- a foot-gun rather than an invariant.
select tests.become_service();
insert into _tap(line) select lives_ok(
  $$ update public.logs set occurred_at = timestamptz '2019-06-06 12:00:00+00'
      where id = 'beef0000-0000-0000-0000-000000000001' $$,
  'the owning role can still correct a log — migrations and backfills are not blocked');

-- ---------------------------------------------------------------------------
-- 4. Hard-deleting a pet destroyed its log history
-- ---------------------------------------------------------------------------
-- pets.archived_at exists precisely so log history outlives the pet, and logs.pet_id is
-- `on delete cascade` — but 0006 also granted a real DELETE policy, so the soft-delete
-- contract was optional. Observed: DELETE /pets returned 204 and took the logs with it.

insert into _tap(line) select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'pets' and cmd = 'DELETE'),
  0, 'pets has no DELETE policy at all');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _tap(line) select lives_ok(
  $$ delete from public.pets where id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'an owner deleting their OWN pet runs without error (RLS filters, it does not throw)');

select tests.become_service();
insert into _tap(line) select is(
  (select count(*)::int from public.pets
    where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  1, 'but Rex survives — archiving is now the only client-reachable removal');

insert into _tap(line) select is(
  (select count(*)::int from public.logs
    where id = 'beef0000-0000-0000-0000-000000000001'),
  1, 'and so does his log history, which was the whole point of archived_at');

-- ---------------------------------------------------------------------------
-- 5. create_invite picked an arbitrary household
-- ---------------------------------------------------------------------------
-- `… where user_id = auth.uid() limit 1` with no ORDER BY, while my_household_id() orders
-- by joined_at. For a user in two households the app and the invite could disagree about
-- which one they are "in", so an owner could hand out a code to the wrong household.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'dave@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Dave"}', '', '', '', '')
on conflict (id) do nothing;

insert into public.household_invites (id, household_id, code, role, created_by, expires_at, max_uses)
values ('cafe0000-0000-0000-0000-000000000020', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'RVW001', 'member', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5),
       ('cafe0000-0000-0000-0000-000000000021', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'RVW002', 'walker', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5),
       ('cafe0000-0000-0000-0000-000000000022', 'aaaaaaaa-0000-0000-0000-0000000000a1',
        'RVW003', 'walker', 'aaaaaaaa-0000-0000-0000-000000000001',
        now() + interval '7 days', 5);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');

-- Dave lands in two households, in the order a real second phone does.
create temp table _dave_own on commit drop as
  select public.create_household_with_membership('Dave Phone', 'Europe/London') as id;
grant all on _dave_own to public;

select public.redeem_invite('RVW001');

create temp table _dave_invite on commit drop as
  select (public.create_invite('member', interval '1 day', 3)).household_id as hid;
grant all on _dave_invite to public;

insert into _tap(line) select is(
  (select hid from _dave_invite), public.my_household_id(),
  'create_invite and my_household_id() now agree on which household the user is in');

insert into _tap(line) select is(
  (select hid from _dave_invite), (select id from _dave_own),
  'and both resolve by joined_at, so the code is for the household the app has open');

-- ---------------------------------------------------------------------------
-- 6. An expired walker could not be re-invited
-- ---------------------------------------------------------------------------
-- redeem_invite ended `on conflict do nothing`. A walker whose 24-hour window closed still
-- HAS a membership row, so a fresh invite silently did nothing: the use was consumed and
-- access was not restored. No screen exposes deleting the member row, so this was terminal.

select tests.become_service();
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'walker@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Wanda"}', '', '', '', '')
on conflict (id) do nothing;

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000007');
select public.redeem_invite('RVW002');

select tests.become_service();
update public.household_members set member_expires_at = now() - interval '1 hour'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000007';

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000007');
select public.redeem_invite('RVW003');

select tests.become_service();
insert into _tap(line) select ok(
  (select member_expires_at > now() from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000007'),
  'a lapsed walker re-redeeming a fresh code gets their window back');

insert into _tap(line) select is(
  (select count(*)::int from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000007'),
  1, 'and still holds exactly one membership row');

-- The other direction matters more: a walker code must never demote whoever redeems it.
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select public.redeem_invite('RVW003');

select tests.become_service();
insert into _tap(line) select is(
  (select role::text from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'owner', 'an owner redeeming a walker code is NOT demoted');

insert into _tap(line) select ok(
  (select member_expires_at is null from public.household_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'and does not acquire a 24-hour expiry on their own household');

-- ---------------------------------------------------------------------------
-- 7. Unbounded household creation
-- ---------------------------------------------------------------------------
-- Every empty household is scanned by every dispatcher tick and by reconcile_predictions,
-- forever. Observed: one user created 12 in a tight loop, 11 of them unreachable through
-- my_household_id() and invisible to their own owner.
--
-- This caps a single user, which is what the RPC can see. It does NOT stop a script minting
-- fresh anonymous users — that ceiling belongs to Supabase's anonymous sign-in rate limit.

select tests.become_service();
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change)
values ('aaaaaaaa-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'spam@test.local', 'x',
        now(), now(), now(), '{}', '{"name":"Spammer"}', '', '', '', '')
on conflict (id) do nothing;

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000008');

insert into _tap(line) select lives_ok(
  $$ select public.create_household_with_membership('h1'),
            public.create_household_with_membership('h2'),
            public.create_household_with_membership('h3'),
            public.create_household_with_membership('h4'),
            public.create_household_with_membership('h5') $$,
  'the limit is generous enough that a real user never meets it');

insert into _tap(line) select throws_ok(
  $$ select public.create_household_with_membership('h6') $$,
  'P0001', null,
  'the sixth in an hour is refused');

-- ---------------------------------------------------------------------------
-- 8. A failed log insert stranded the notification as 'actioned'
-- ---------------------------------------------------------------------------
-- log-action wins gate 1 (sent -> actioned) BEFORE inserting the log. If that insert failed
-- for any reason other than a duplicate key, the notification stayed claimed with no log
-- behind it — and the phone's retry then LOST the claim and received
-- {ok: true, replayed: true}: a success response for a tap that never logged anything.

select tests.become_service();
insert into public.notifications
  (id, household_id, pet_id, kind, dedupe_key, title, body, scheduled_for, sent_at,
   status, action, action_at)
values ('f00d0000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a1',
        'break_prediction', 'review:claimed', 't', 'b', now(), now(),
        'actioned', 'LOG_YES', now()),
       ('f00d0000-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a1',
        'break_prediction', 'review:superseded', 't', 'b', now(), now(),
        'superseded', null, null);

select public.release_notification_claim('f00d0000-0000-0000-0000-000000000001');
select public.release_notification_claim('f00d0000-0000-0000-0000-000000000002');

insert into _tap(line) select is(
  (select status::text from public.notifications
    where id = 'f00d0000-0000-0000-0000-000000000001'),
  'sent', 'releasing a stranded claim puts the notification back in play');

insert into _tap(line) select ok(
  (select action is null and action_at is null and action_by is null
     from public.notifications where id = 'f00d0000-0000-0000-0000-000000000001'),
  'and clears the action, so the retry wins a clean gate 1');

insert into _tap(line) select is(
  (select status::text from public.notifications
    where id = 'f00d0000-0000-0000-0000-000000000002'),
  'superseded', 'a notification a real log superseded is NOT resurrected');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _tap(line) select throws_ok(
  $$ select public.release_notification_claim('f00d0000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'and a client cannot un-claim a notification itself');

-- ---------------------------------------------------------------------------
-- 9. Receipt polling gave up before Expo had produced the receipt
-- ---------------------------------------------------------------------------
-- check-receipts marked every row it looked at as checked, receipt or not. Expo can take
-- minutes; the job runs every 15. A push sent shortly before a run was routinely marked
-- checked while still receipt-less, and then excluded forever. DeviceNotRegistered was
-- therefore rarely seen — and it is the ONLY thing that retires a dead push token.

select tests.become_service();
update public.notifications
   set expo_tickets = '[{"token":"ExponentPushToken[x]","status":"ok","id":"t1"}]'::jsonb
 where id = 'f00d0000-0000-0000-0000-000000000001';

insert into _tap(line) select ok(
  (select sent_at is not null from public.notifications_awaiting_receipts()
    where id = 'f00d0000-0000-0000-0000-000000000001'),
  'notifications_awaiting_receipts now returns sent_at, so the caller can tell '
  '"no receipt yet" from "past Expo retention"');

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _tap(line) select throws_ok(
  $$ select * from public.notifications_awaiting_receipts() $$,
  '42501', null, 'and it stays service-role only');

-- ---------------------------------------------------------------------------
-- 10. is_owner ignored membership expiry
-- ---------------------------------------------------------------------------
-- is_member and is_editor both honour member_expires_at; is_owner did not. Latent rather
-- than live — no owner is issued an expiry today — but the three are read as a family, and
-- a future time-boxed owner would have kept full rights forever.

select tests.become_service();
select set_config('request.jwt.claims',
                  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001',
                                    'role', 'authenticated')::text, true);

insert into _tap(line) select ok(
  app.is_owner('aaaaaaaa-0000-0000-0000-0000000000a1'),
  'an unexpired owner is an owner');

update public.household_members set member_expires_at = now() - interval '1 hour'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and household_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

insert into _tap(line) select ok(
  not app.is_owner('aaaaaaaa-0000-0000-0000-0000000000a1'),
  'an expired one is not — is_owner now matches is_member and is_editor');

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
