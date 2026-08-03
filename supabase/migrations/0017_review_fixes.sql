-- 0017_review_fixes.sql
-- Fixes from the end-to-end backend review. Each section states the defect, how it was
-- observed, and why the fix is shaped the way it is.

-- ---------------------------------------------------------------------------
-- 1. record_break_no was callable by ANY authenticated user, for ANY pet
-- ---------------------------------------------------------------------------
-- 0007's revoke block ends `from public, anon` — it omits `authenticated`. Supabase's
-- default privileges grant EXECUTE on every new function in `public` to `authenticated`,
-- so revoking PUBLIC never removed it. 0011 and 0012 got this right
-- (`from public, anon, authenticated`); 0007 did not, and record_break_no is the only
-- function there that was never meant to reach a client.
--
-- Observed on staging: a freshly signed-up anonymous user, member of nothing, called
-- record_break_no against another household's pet and moved its notify_at 20 minutes and
-- incremented consecutive_no_count — the input to hold-time recalibration.
--
-- Two fixes, because the grant alone is one `create or replace` away from regressing:
-- close the grant AND make the function defend itself.

create or replace function public.record_break_no(
  p_pet_id     uuid,
  p_break_type public.break_type
) returns public.prediction_state
language plpgsql security definer set search_path = public as $$
declare v_row public.prediction_state;
begin
  -- service_role (the log-action Edge Function) has no auth.uid() and is trusted.
  -- Any other caller must be a member of the household that owns this pet.
  if auth.uid() is not null and not app.is_member(app.pet_household(p_pet_id)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.prediction_state
     set consecutive_no_count = consecutive_no_count + 1,
         notify_at            = now() + interval '20 minutes',
         reask_seq            = reask_seq + 1,   -- see section 2
         updated_at           = now()
   where pet_id = p_pet_id and break_type = p_break_type
  returning * into v_row;

  return v_row;
end $$;

revoke execute on function public.record_break_no(uuid, public.break_type)
  from public, anon, authenticated;
grant execute on function public.record_break_no(uuid, public.break_type) to service_role;

-- Sweep the same omission across the rest of 0007. These are all *intended* to be
-- callable by `authenticated`, so this is a no-op for them today — it exists so the
-- grant surface is stated explicitly in one place rather than inherited by default.
revoke execute on function public.get_my_data() from public, anon;

-- ---------------------------------------------------------------------------
-- 2. "Snooze 15" and "Not yet" could never produce a second push
-- ---------------------------------------------------------------------------
-- dedupe_key is 'break:{pet}:{type}:{predicted_at}'. Both re-ask paths move notify_at but
-- deliberately leave predicted_at alone (Δ7 — a missed break must keep reading "overdue").
-- So when the re-ask came due, due_break_predictions produced the SAME dedupe_key, the
-- dispatcher's INSERT hit the unique constraint, and the item was counted as `skipped`.
--
-- Net effect: record_break_no's "re-ask in 20 minutes" and snooze_break's 15-minute
-- re-arm both wrote state that could never result in a notification. Silent, and invisible
-- in the dispatcher's own logs because a skip is the expected outcome of a replayed tick.
--
-- Fix: a re-ask counter that participates in the dedupe key. Each re-ask mints exactly one
-- new key, so it fires exactly once. mark_break_dispatched deliberately does NOT touch it,
-- which preserves 0013's guarantee that a stale prediction re-entering the due window
-- cannot nag.

alter table public.prediction_state
  add column if not exists reask_seq int not null default 0;

comment on column public.prediction_state.reask_seq is
  'Increments on each LOG_NO / SNOOZE re-ask. Participates in the break dedupe_key so a '
  're-ask mints exactly one new key. Reset to 0 whenever a new log re-anchors the cycle.';

create or replace function public.due_break_predictions()
returns table (
  household_id uuid,
  pet_id       uuid,
  pet_name     text,
  break_type   public.break_type,
  predicted_at timestamptz,
  dedupe_key   text
)
language sql security definer stable set search_path = public as $$
  select p.household_id,
         ps.pet_id,
         p.name,
         ps.break_type,
         ps.predicted_at,
         'break:' || ps.pet_id || ':' || ps.break_type || ':' ||
           to_char(ps.predicted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') ||
           -- Suffix only when re-asked, so existing keys keep their exact shape and no
           -- already-sent notification can be re-sent by this migration.
           case when ps.reask_seq > 0 then ':r' || ps.reask_seq else '' end
    from public.prediction_state ps
    join public.pets p on p.id = ps.pet_id
   where ps.notify_at is not null
     and ps.notify_at <= now()
     and (ps.snoozed_until is null or ps.snoozed_until <= now())
     and p.archived_at is null
     and not app.in_quiet_hours(p.household_id);
$$;

revoke execute on function public.due_break_predictions() from public, anon, authenticated;
grant execute on function public.due_break_predictions() to service_role;

create or replace function public.snooze_break(
  p_pet_id uuid, p_break_type public.break_type,
  p_notification_id uuid, p_minutes int default 15
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.prediction_state
     set snoozed_until = now() + make_interval(mins => p_minutes),
         notify_at     = now() + make_interval(mins => p_minutes),
         reask_seq     = reask_seq + 1,
         updated_at    = now()
   where pet_id = p_pet_id and break_type = p_break_type;

  -- Scoped to this pet's break. Previously this reopened a notification by id alone, so a
  -- snooze could resurrect a row belonging to a different pet or kind.
  update public.notifications n
     set status = 'sent', action = null, action_at = null
   where n.id = p_notification_id
     and n.pet_id = p_pet_id
     and n.kind = 'break_prediction'
     -- Never resurrect a push that a real log superseded: the question was answered.
     and n.status = 'actioned';
end $$;

revoke execute on function public.snooze_break(uuid, public.break_type, uuid, int)
  from public, anon, authenticated;
grant execute on function public.snooze_break(uuid, public.break_type, uuid, int) to service_role;

-- recompute_prediction must clear reask_seq when a genuinely new log re-anchors the cycle,
-- on the same condition that already resets consecutive_no_count. Restated in full because
-- migrations are immutable and this is a fix-forward.
create or replace function app.recompute_prediction(p_pet_id uuid, p_type public.break_type)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hold      numeric(4,1);
  v_household uuid;
  v_tz        text;
  v_anchor    timestamptz;
  v_predicted timestamptz;
  v_buffer    int;
  v_last_log  uuid;
  v_has_feed  boolean;
begin
  select case p_type when 'pee' then p.pee_hold_hours else p.poop_hold_hours end,
         p.household_id, h.timezone
    into v_hold, v_household, v_tz
    from public.pets p
    join public.households h on h.id = p.household_id
   where p.id = p_pet_id and p.archived_at is null;

  if v_hold is null then
    delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
    return;
  end if;

  select exists (
    select 1 from public.feed_times ft where ft.pet_id = p_pet_id and ft.active
  ) into v_has_feed;

  if not v_has_feed then
    delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
    return;
  end if;

  select l.occurred_at, l.id
    into v_anchor, v_last_log
    from public.logs l
   where l.pet_id = p_pet_id
     and l.type = p_type::text::public.log_type
     and l.deleted_at is null
   order by l.occurred_at desc
   limit 1;

  if v_anchor is null then
    select (date_trunc('day', now() at time zone v_tz) + min(ft.local_time)) at time zone v_tz
      into v_anchor
      from public.feed_times ft
     where ft.pet_id = p_pet_id and ft.active;

    if v_anchor is null then
      delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
      return;
    end if;
  end if;

  -- nextRepeating() — steps AT MOST one interval past the anchor (Δ7).
  if v_anchor > now() then
    v_predicted := v_anchor;
  else
    v_predicted := v_anchor + (v_hold::double precision * interval '1 hour');
  end if;

  v_buffer := least(45, greatest(10, round(v_hold * 60 * 0.15)::int));

  insert into public.prediction_state as ps
        (pet_id, break_type, anchor_at, hold_hours, predicted_at, buffer_minutes,
         notify_at, snoozed_until, last_log_id, updated_at)
  values (p_pet_id, p_type, v_anchor, v_hold, v_predicted, v_buffer,
          v_predicted - make_interval(mins => v_buffer), null, v_last_log, now())
  on conflict (pet_id, break_type) do update
     set anchor_at      = excluded.anchor_at,
         hold_hours     = excluded.hold_hours,
         predicted_at   = excluded.predicted_at,
         buffer_minutes = excluded.buffer_minutes,
         notify_at      = excluded.notify_at,
         snoozed_until  = null,
         last_log_id    = excluded.last_log_id,
         consecutive_no_count = case
           when excluded.last_log_id is distinct from ps.last_log_id then 0
           else ps.consecutive_no_count
         end,
         -- A new anchor starts a new cycle, so the re-ask chain restarts too. Without this
         -- the ':rN' suffix would grow forever and leak across cycles.
         reask_seq = case
           when excluded.last_log_id is distinct from ps.last_log_id then 0
           else ps.reask_seq
         end,
         updated_at     = now();
end $$;

-- ---------------------------------------------------------------------------
-- 3. Logs were not immutable — any member could rewrite history
-- ---------------------------------------------------------------------------
-- 0006's logs_update policy is `using (is_member) with check (is_member)` with no column
-- restriction, and RLS cannot express one. The comment says "soft-delete and note edits
-- only"; nothing enforced it.
--
-- Observed on staging: a time-boxed WALKER changed an existing pee log to type 'food',
-- backdated occurred_at to 2019, flipped source from 'walker' to 'manual', and reassigned
-- created_by to themselves. Logs are the prediction anchor and the audit trail, so this is
-- both a correctness hole (rewriting the anchor moves everyone's reminders) and an
-- accountability one.
--
-- The client already only ever writes `note` and `deleted_at` (lib/repo/synced.ts:335),
-- so enforcing that server-side changes no working behaviour.

-- SECURITY INVOKER (the default) is load-bearing here: under SECURITY DEFINER,
-- `current_user` resolves to the function OWNER, so every caller would look like the owner
-- and the guard would never fire. As an invoker trigger, current_user is the role
-- PostgREST switched into — which is the only thing a client can influence.
create or replace function app.enforce_log_immutability() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Guard the CLIENT-REACHABLE roles rather than exempting service_role, because those two
  -- are the complete set of roles an API key can assume. Exempting service_role alone would
  -- also have blocked `postgres`, i.e. every future migration and admin correction —
  -- turning a data-integrity guard into a foot-gun the first time a backfill is needed.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id              is distinct from old.id
  or new.household_id    is distinct from old.household_id
  or new.pet_id          is distinct from old.pet_id
  or new.type            is distinct from old.type
  or new.occurred_at     is distinct from old.occurred_at
  or new.source          is distinct from old.source
  or new.notification_id is distinct from old.notification_id
  or new.feed_time_id    is distinct from old.feed_time_id
  or new.medication_id   is distinct from old.medication_id
  or new.created_by      is distinct from old.created_by
  or new.created_at      is distinct from old.created_at then
    raise exception
      'LOG_IMMUTABLE: only note and deleted_at may be updated on a log'
      using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger trg_logs_immutable before update on public.logs
  for each row execute function app.enforce_log_immutability();

-- ---------------------------------------------------------------------------
-- 4. Hard-deleting a pet destroyed its entire log history
-- ---------------------------------------------------------------------------
-- pets.archived_at exists precisely so "log history survives the pet" (0003:103), and
-- logs.pet_id is `on delete cascade`. But 0006 also granted a real DELETE policy, so the
-- soft-delete contract was optional. Deleting a pet silently took every log with it —
-- including the shared household history the other caregiver wrote.
--
-- Observed on staging: created a pet, logged a pee, DELETE /pets?id=eq.… returned 204, and
-- the log was gone.
--
-- The synced repo already archives instead (lib/repo/synced.ts:187), so removing the policy
-- costs nothing and closes the path. Cascade deletion of a whole household is unaffected:
-- that runs as an owner-initiated `delete from households`, which cascades at the FK level
-- rather than through this policy.

drop policy if exists pets_delete on public.pets;

comment on column public.pets.archived_at is
  'Soft delete. There is deliberately no DELETE policy on pets — archiving is the only '
  'client-reachable removal, because logs.pet_id cascades and log history must outlive '
  'the pet.';

-- ---------------------------------------------------------------------------
-- 5. create_invite picked an arbitrary household for multi-household users
-- ---------------------------------------------------------------------------
-- `select … from household_members where user_id = auth.uid() … limit 1` with no ORDER BY.
-- my_household_id() orders by joined_at, so the app and the invite could disagree about
-- which household the user is "in", and an owner could hand out a code to the wrong one.
-- This is the same latent defect SYNC-4 already fixed in SessionContext.

create or replace function public.create_invite(
  p_role       public.member_role default 'member',
  p_expires_in interval default interval '7 days',
  p_max_uses   int default 5
) returns public.household_invites
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_invite    public.household_invites;
begin
  select m.household_id into v_household
    from public.household_members m
   where m.user_id = auth.uid()
     and m.role in ('owner','member')
     and (m.member_expires_at is null or m.member_expires_at > now())
   order by m.joined_at          -- same resolution as my_household_id()
   limit 1;

  if v_household is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  if p_role = 'walker' and not app.is_owner(v_household) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0001';
  end if;

  perform app.check_rate_limit('create_invite:' || v_household::text, 10, interval '1 day');

  insert into public.household_invites (household_id, role, created_by, expires_at, max_uses)
  values (v_household, p_role, auth.uid(), now() + p_expires_in, p_max_uses)
  returning * into v_invite;

  return v_invite;
end $$;

revoke execute on function public.create_invite(public.member_role, interval, int)
  from public, anon;
grant execute on function public.create_invite(public.member_role, interval, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. An expired walker could not be re-invited
-- ---------------------------------------------------------------------------
-- redeem_invite ends `on conflict (household_id, user_id) do nothing`. A walker whose
-- 24-hour window closed still HAS a membership row, so redeeming a fresh invite silently
-- did nothing: the invite's use_count was consumed and access was not restored. The owner
-- had to delete the member row first, which no screen exposes.
--
-- Observed on staging: second redeem returned 200, member_expires_at unchanged, invite
-- burned 1/1.
--
-- Fix: re-redeeming refreshes the window. Deliberately never DOWNGRADES an existing
-- member/owner — a walker code redeemed by an owner must not demote them or put an expiry
-- on their access.

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_role      public.member_role;
  v_expires   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  perform app.check_rate_limit('redeem_invite:' || auth.uid()::text, 5, interval '1 hour');

  update public.household_invites i
     set use_count = i.use_count + 1
   where i.code = upper(trim(p_code))
     and i.revoked_at is null
     and i.expires_at > now()
     and i.use_count < i.max_uses
  returning i.household_id, i.role into v_household, v_role;

  if v_household is null then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;

  v_expires := case when v_role = 'walker' then now() + interval '24 hours' else null end;

  insert into public.household_members (household_id, user_id, role, member_expires_at)
  values (v_household, auth.uid(), v_role, v_expires)
  on conflict (household_id, user_id) do update
     set role = case
           -- Never demote an existing owner/member with a walker code.
           when household_members.role in ('owner','member') then household_members.role
           else excluded.role
         end,
         member_expires_at = case
           when household_members.role in ('owner','member') then household_members.member_expires_at
           else excluded.member_expires_at
         end;

  return v_household;
end $$;

revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Unbounded household creation
-- ---------------------------------------------------------------------------
-- create_household_with_membership had no rate limit. Anonymous signup is free and
-- unauthenticated, so one script could mint users and households without bound; each empty
-- household is then scanned by every dispatcher tick and by reconcile_predictions forever.
-- Observed: one user created 12 households in a tight loop, 11 of them unreachable through
-- my_household_id() and invisible to the owner.

create or replace function public.create_household_with_membership(
  p_name     text default 'My Household',
  p_timezone text default 'America/Los_Angeles'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- Generous enough that a legitimate user (one at first launch, a few across re-installs
  -- or a household switch) never sees it.
  perform app.check_rate_limit(
    'create_household:' || auth.uid()::text, 5, interval '1 hour');

  insert into public.households (name, timezone, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'My Household'), p_timezone, auth.uid())
  returning id into v_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end $$;

revoke execute on function public.create_household_with_membership(text, text)
  from public, anon;
grant execute on function public.create_household_with_membership(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. A failed log insert stranded the notification as 'actioned'
-- ---------------------------------------------------------------------------
-- log-action wins gate 1 (status 'sent' -> 'actioned') and only then inserts the log. If
-- that insert fails for any reason other than a duplicate key, the notification is left
-- claimed with no log behind it. The phone's retry then LOSES the claim and receives
-- {ok: true, replayed: true} — a success response for a tap that never logged anything.
--
-- The claim cannot simply move after the insert: gate 2 (the client log id) only
-- de-duplicates the SAME device's retry, so the claim is what stops the second caregiver
-- writing a second log for one pee. It has to stay first, and be released on failure.

create or replace function public.release_notification_claim(p_notification_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.notifications
     set status = 'sent', action = null, action_at = null, action_by = null
   where id = p_notification_id
     -- Only un-claim what is still claimed. A row superseded by a real log in the meantime
     -- must stay superseded — the desired end state genuinely holds there.
     and status = 'actioned';
$$;

revoke execute on function public.release_notification_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.release_notification_claim(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Receipt polling gave up before Expo had the receipt
-- ---------------------------------------------------------------------------
-- check-receipts marked EVERY row it looked at as checked, whether or not a receipt came
-- back. Expo can take minutes to produce one and the job runs every 15 minutes, so a push
-- sent shortly before a run was routinely marked checked while receipt-less — and
-- notifications_awaiting_receipts then excluded it forever. DeviceNotRegistered was
-- therefore rarely observed, and revoke_push_token rarely fired, which is the one
-- mechanism that retires dead tokens.
--
-- The function now also returns sent_at so the caller can distinguish "no receipt yet"
-- (retry later) from "past Expo's ~24h retention" (give up).

drop function if exists public.notifications_awaiting_receipts();

create or replace function public.notifications_awaiting_receipts()
returns table (id uuid, expo_tickets jsonb, sent_at timestamptz)
language sql security definer stable set search_path = public as $$
  select n.id, n.expo_tickets, n.sent_at
    from public.notifications n
   where n.expo_tickets is not null
     and n.sent_at > now() - interval '24 hours'
     and not (n.expo_tickets @> '[{"receiptChecked": true}]'::jsonb)
   order by n.sent_at
   limit 500;
$$;

revoke execute on function public.notifications_awaiting_receipts()
  from public, anon, authenticated;
grant execute on function public.notifications_awaiting_receipts() to service_role;

-- ---------------------------------------------------------------------------
-- 10. is_owner ignored membership expiry
-- ---------------------------------------------------------------------------
-- is_member and is_editor both honour member_expires_at; is_owner did not. No owner is
-- issued an expiry today, so this is latent rather than live — but the three helpers are
-- read as a family, and a future time-boxed owner would silently keep full rights forever.

create or replace function app.is_owner(p_household uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
       and m.role = 'owner'
       and (m.member_expires_at is null or m.member_expires_at > now())
  );
$$;

grant execute on function app.is_owner(uuid) to authenticated, anon, service_role;
