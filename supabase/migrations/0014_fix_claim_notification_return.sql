-- 0014_fix_claim_notification_return.sql
-- Fixes a correctness bug that silently disabled idempotency gate 1.
--
-- THE BUG
-- claim_notification() returned `public.notifications`, a composite type. When the claim
-- LOSES — the partner answered first, or a manual log superseded the push — the function
-- returns NULL, which is correct at the SQL level:
--
--     select to_jsonb(claim_notification(<already-actioned>, 'LOG_YES', null));
--     -- {"id": null, "status": null, "title": null, ...}
--
-- PostgREST serializes a NULL composite as an OBJECT WITH ALL-NULL FIELDS, not as JSON
-- null. supabase-js hands that straight to the caller, where:
--
--     if (!claimed) { ...treat as replay... }
--
-- never fires, because `{id: null, ...}` is truthy in JavaScript. Every caller "won" the
-- claim. Gate 1 was effectively switched off.
--
-- Observed on staging: Alice taps Yes, Bob taps Yes seconds later, TWO logs are written for
-- one physical pee. That is precisely the two-caregiver race the whole design exists to
-- prevent, and it would have stayed invisible until two people happened to tap at once.
--
-- THE FIX
-- Return a scalar uuid. A NULL scalar serializes as JSON null, which is falsy, so the
-- losing caller is correctly recognised as a replay. The caller also now checks for a
-- non-empty string rather than mere truthiness, so a future return-type change cannot
-- reintroduce this silently.

drop function if exists public.claim_notification(uuid, text, uuid);

create or replace function public.claim_notification(
  p_notification_id uuid,
  p_action          text,
  p_action_by       uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.notifications
     set status    = 'actioned',
         action    = p_action,
         action_at = now(),
         action_by = p_action_by
   where id = p_notification_id
     -- 'superseded' (a manual log landed first) and 'actioned' (partner already answered)
     -- both fail to match. That single predicate IS the two-caregiver guarantee.
     and status = 'sent'
  returning id into v_id;

  return v_id;   -- NULL when the claim was lost -> JSON null -> falsy in the caller
end $$;

revoke execute on function public.claim_notification(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_notification(uuid, text, uuid) to service_role;
