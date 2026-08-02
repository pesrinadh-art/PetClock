-- 0013_fix_notify_rollforward.sql
-- Fixes a live inefficiency found while testing the dispatcher against staging.
--
-- THE BUG
-- mark_break_dispatched() rolled notify_at forward by exactly one hold interval:
--
--     notify_at = predicted_at + hold_hours
--
-- That is fine when the prediction is roughly current. It is wrong when it is stale.
-- Luna's seeded prediction was 164 hours old, so one 4-hour step landed at 160 hours ago —
-- still in the past, so still due. The row therefore stayed in the due window PERMANENTLY:
-- every minute, forever, the dispatcher selected it and attempted an INSERT that could only
-- ever fail on dedupe_key.
--
-- Correct behaviour, wasted work. One abandoned pet costs 1,440 doomed inserts a day; a
-- thousand of them costs a million.
--
-- THE FIX
-- Guarantee the row actually leaves the due window by taking whichever is later: the next
-- natural cycle, or one hold from now.
--
--     notify_at = greatest(predicted_at + hold, now() + hold)
--
-- A current prediction behaves exactly as before. A stale one steps to now + hold and comes
-- back once per cycle instead of once per minute — a ~240x reduction at a 4-hour hold.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--   * predicted_at stays put, so the app still reads "overdue" (Δ7).
--   * dedupe_key is pinned to predicted_at, so returning to the due window can never
--     produce a second push for the same cycle. The pet is not nagged; we simply stop
--     burning a write every minute to discover that.

create or replace function public.mark_break_dispatched(
  p_pet_id uuid, p_break_type public.break_type, p_notification_id uuid
) returns void
language sql security definer set search_path = public as $$
  update public.prediction_state
     set notify_at = greatest(
           predicted_at + (hold_hours::double precision * interval '1 hour'),
           now()        + (hold_hours::double precision * interval '1 hour')
         ),
         last_notification_id = p_notification_id,
         updated_at = now()
   where pet_id = p_pet_id and break_type = p_break_type;
$$;

revoke execute on function public.mark_break_dispatched(uuid, public.break_type, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_break_dispatched(uuid, public.break_type, uuid)
  to service_role;
