-- 0005_functions_triggers.sql
-- Server-side prediction engine + the trigger chain that keeps it current.
--
-- The critical invariant: app.recompute_prediction() must implement the SAME algorithm as
-- lib/petSchedule.ts getUpcomingForPet(), or the app's optimistic UI and the server's
-- pushes will disagree about when a break is due.

-- ---------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_touch_households  before update on public.households
  for each row execute function app.touch_updated_at();
create trigger trg_touch_pets        before update on public.pets
  for each row execute function app.touch_updated_at();
create trigger trg_touch_appts       before update on public.appointments
  for each row execute function app.touch_updated_at();
create trigger trg_touch_feed        before update on public.feed_times
  for each row execute function app.touch_updated_at();
create trigger trg_touch_meds        before update on public.medications
  for each row execute function app.touch_updated_at();

-- Rescheduling an appointment re-arms every one of its reminders. Without this, moving a
-- vet visit leaves reminders pointing at the old time (and already-sent ones never re-fire).
create or replace function app.sync_reminder_fire_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.appointment_reminders r
     set fire_at = new.starts_at - make_interval(mins => r.offset_minutes),
         sent_at = case when new.starts_at is distinct from old.starts_at then null else r.sent_at end
   where r.appointment_id = new.id;
  return new;
end $$;

create trigger trg_appt_reschedule after update of starts_at on public.appointments
  for each row execute function app.sync_reminder_fire_at();

-- Profile bootstrap on signup — fires for anonymous users too, which is the default
-- first-launch path (§5.1: signInAnonymously, zero friction).
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Pet parent'))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- THE CORE: recompute one pet's break prediction
-- ---------------------------------------------------------------------------
--
-- Port of lib/petSchedule.ts getUpcomingForPet() -> addHoldItem():
--
--   hasSchedule(pet)  : needs hold hours AND >=1 feed time, else no prediction at all
--   anchor            : most recent non-deleted log of this type,
--                       else today's earliest active feed time (household-local)
--   nextRepeating()   : predicted = anchor > now ? anchor : anchor + hold
--   bufferMsFor()     : clamp(round(hold * 60 * 0.15), 10, 45) minutes
--   notify_at         : predicted - buffer  (when the push fires)
--
-- Δ7 — DELIBERATE DIVERGENCE FROM docs/BACKEND_PLAN.md:374.
-- The plan rolls the prediction forward in a loop until it is in the future:
--     while v_predicted <= now() loop v_predicted := v_predicted + hold; end loop;
-- That is the pre-D7 client behaviour. The FE deliberately fixed it (petSchedule.ts:112):
-- a prediction whose time has passed STAYS PUT and reports overdueBy, so a missed break
-- surfaces as "overdue" instead of silently sliding to the next cycle and masking the miss.
-- Keeping the plan's loop would put the server a whole interval ahead of the app's own UI.
-- Re-fire suppression is handled where it belongs instead: the dispatcher rolls notify_at
-- forward one cycle AFTER sending (BACKEND_PLAN §3.3), which does not touch predicted_at.
--
-- Also fixed vs the plan: make_interval(hours => ...) takes an INT, so a 4.5h hold would
-- have been truncated to 4h. Multiplying an interval by a float is exact.
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

  -- No hold time (or pet archived/missing) => nothing to predict.
  if v_hold is null then
    delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
    return;
  end if;

  -- Mirrors hasSchedule(): the client shows no prediction without a feed time, so the
  -- server must not push one either.
  select exists (
    select 1 from public.feed_times ft where ft.pet_id = p_pet_id and ft.active
  ) into v_has_feed;

  if not v_has_feed then
    delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
    return;
  end if;

  -- Anchor = most recent log of this type. break_type and log_type share label values.
  select l.occurred_at, l.id
    into v_anchor, v_last_log
    from public.logs l
   where l.pet_id = p_pet_id
     and l.type = p_type::text::public.log_type
     and l.deleted_at is null
   order by l.occurred_at desc
   limit 1;

  -- Fallback anchor: today's earliest active feed time, resolved in household-local time.
  -- (petSchedule.ts uses todaysFeedTimes[0] as a stand-in "wake time".)
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

  -- nextRepeating() — steps AT MOST one interval past the anchor. See Δ7 above.
  if v_anchor > now() then
    v_predicted := v_anchor;
  else
    v_predicted := v_anchor + (v_hold::double precision * interval '1 hour');
  end if;

  -- bufferMsFor(): ~15% of the hold, clamped to 10..45 minutes.
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
         -- A fresh log clears any snooze: the question has been answered.
         snoozed_until  = null,
         last_log_id    = excluded.last_log_id,
         -- Reset the "not yet" streak only when a genuinely new log anchors us.
         consecutive_no_count = case
           when excluded.last_log_id is distinct from ps.last_log_id then 0
           else ps.consecutive_no_count
         end,
         updated_at     = now();
end $$;

-- ---------------------------------------------------------------------------
-- Trigger chain — every path that can invalidate a prediction
-- ---------------------------------------------------------------------------

-- After any pee/poo log (manual, from either caregiver, or from a notification tap):
--   1. recompute this pet's prediction
--   2. supersede any in-flight push for the same break, so a partner's stale
--      notification cannot double-log. This is what makes gate 1 in log-action work.
create or replace function app.on_log_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('pee','poo') and new.deleted_at is null then
    perform app.recompute_prediction(new.pet_id, new.type::text::public.break_type);

    update public.notifications
       set status = 'superseded'
     where pet_id = new.pet_id
       and kind = 'break_prediction'
       and status = 'sent'
       and (data->>'breakType') = new.type::text
       and id is distinct from new.notification_id;
  end if;
  return new;
end $$;

create trigger trg_logs_after_insert after insert on public.logs
  for each row execute function app.on_log_insert();

-- Undo (soft delete) or restore of a pee/poo log must re-anchor the prediction —
-- otherwise a mis-tapped 💩 that the user undid keeps suppressing the real reminder.
create or replace function app.on_log_soft_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('pee','poo') and new.deleted_at is distinct from old.deleted_at then
    perform app.recompute_prediction(new.pet_id, new.type::text::public.break_type);
  end if;
  return new;
end $$;

create trigger trg_logs_after_soft_delete after update of deleted_at on public.logs
  for each row execute function app.on_log_soft_delete();

-- Hold hours changed (manual edit or nightly recalibration) => re-predict both breaks.
create or replace function app.on_pet_schedule_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.recompute_prediction(new.id, 'pee');
  perform app.recompute_prediction(new.id, 'poo');
  return new;
end $$;

create trigger trg_pets_schedule_change
  after update of pee_hold_hours, poop_hold_hours, archived_at on public.pets
  for each row execute function app.on_pet_schedule_change();

-- Feed times gate hasSchedule() AND provide the fallback anchor, so any change to them
-- can create or destroy a prediction. The plan omitted this trigger; without it a pet
-- whose first feed time is added never starts predicting until an unrelated edit.
create or replace function app.on_feed_time_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pet uuid;
begin
  v_pet := coalesce(new.pet_id, old.pet_id);
  perform app.recompute_prediction(v_pet, 'pee');
  perform app.recompute_prediction(v_pet, 'poo');
  return null;
end $$;

create trigger trg_feed_times_change
  after insert or delete or update of local_time, active on public.feed_times
  for each row execute function app.on_feed_time_change();
