-- 0016 — the join flow (SYNC 4).
--
-- BE-1 shipped `create_invite` and `redeem_invite`, both tested (002_membership_rpcs, 20
-- assertions). Nothing ever called them, so the gap below was invisible until two real
-- devices were pointed at one household.
--
-- The problem: `SessionContext` signs in anonymously, finds no membership, and CREATES a
-- household. So the second phone always lands in its own. Redeeming an invite afterwards
-- leaves that user in TWO households — the empty one it made, and the one it meant to join.
--
-- `my_household_id()` resolves `order by joined_at limit 1`, and the auto-created household
-- is always joined first. So a plain redeem would leave the second phone still opening its
-- own empty household. The user's pets would appear to have vanished.
--
-- Fix: let a user leave a household, and do the redeem + leave in ONE transaction.

-- ---------------------------------------------------------------------------
-- leave_household
-- ---------------------------------------------------------------------------
-- A DELETE policy on household_members already permits `user_id = auth.uid()` (0006_rls.sql
-- :116), so leaving was always possible from the client. What was missing is the guard: an
-- owner walking out of a household that still holds pets orphans every one of them, because
-- membership is the ONLY route to a row under RLS. There is no admin view to recover from.
--
-- SECURITY DEFINER so the household GC below can run; the membership check re-establishes
-- the caller's authority explicitly, since RLS no longer applies inside.
create or replace function public.leave_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role          public.member_role;
  v_other_owners  int;
  v_other_members int;
  v_pets          int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select m.role into v_role
    from public.household_members m
   where m.household_id = p_household_id
     and m.user_id = auth.uid();

  if v_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  select
      count(*) filter (where m.role = 'owner'),
      count(*)
    into v_other_owners, v_other_members
    from public.household_members m
   where m.household_id = p_household_id
     and m.user_id <> auth.uid();

  -- Only the last owner is restricted. A member or walker may always walk away: the
  -- household keeps an owner who can still reach the data.
  if v_role = 'owner' and v_other_owners = 0 then
    select count(*) into v_pets
      from public.pets p
     where p.household_id = p_household_id
       and p.archived_at is null;

    -- Refusing is the conservative half of the trade: the caller can still delete the pets
    -- or (BE-4) hand ownership over. Allowing it would silently strand the data forever.
    if v_pets > 0 then
      raise exception 'LAST_OWNER_HAS_PETS' using errcode = 'P0001';
    end if;

    if v_other_members > 0 then
      raise exception 'LAST_OWNER_HAS_MEMBERS' using errcode = 'P0001';
    end if;
  end if;

  delete from public.household_members m
   where m.household_id = p_household_id
     and m.user_id = auth.uid();

  -- Garbage-collect an empty household. Without this every second phone that ever joined
  -- leaves a permanent orphan row behind, and the dispatcher queries them all forever.
  if v_other_members = 0 then
    delete from public.households h where h.id = p_household_id;
  end if;
end $function$;

comment on function public.leave_household(uuid) is
  'Leave a household. Refuses if the caller is the last owner and pets or other members '
  'remain, which would orphan them beyond any RLS-reachable path. Deletes the household '
  'once its final member leaves.';

-- ---------------------------------------------------------------------------
-- join_household
-- ---------------------------------------------------------------------------
-- Redeem + leave in one statement. Two separate client calls could fail between them and
-- strand the user in both households — precisely the ambiguous state this migration exists
-- to prevent.
--
-- Returns jsonb, NOT a composite. A NULL composite serialises through PostgREST as a
-- *truthy* `{"id": null}` object, which is exactly how idempotency gate 1 was silently
-- disabled until 0014. jsonb has no such trap.
create or replace function public.join_household(
  p_code  text,
  p_leave uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_joined uuid;
  v_left   boolean := false;
begin
  -- Rate limiting, invite validity, atomic use_count claim and the membership insert all
  -- live in redeem_invite already. Reuse it rather than restating the rules here.
  v_joined := public.redeem_invite(p_code);

  if p_leave is not null and p_leave <> v_joined then
    begin
      perform public.leave_household(p_leave);
      v_left := true;
    exception when others then
      -- A failed leave must NOT roll the join back. If the old household still holds pets
      -- the user genuinely belongs to two, and the client's cached id decides which opens.
      -- Losing the join over a housekeeping step would be the worse outcome.
      v_left := false;
    end;
  end if;

  return jsonb_build_object('householdId', v_joined, 'leftPrevious', v_left);
end $function$;

comment on function public.join_household(text, uuid) is
  'Redeem an invite and, in the same transaction, leave the household the caller was in '
  '(typically the empty one auto-created at first launch). A failed leave does not roll '
  'back the join.';

revoke all on function public.leave_household(uuid) from public, anon;
revoke all on function public.join_household(text, uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.join_household(text, uuid) to authenticated;
