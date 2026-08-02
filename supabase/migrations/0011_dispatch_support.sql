-- 0011_dispatch_support.sql
-- Server-side support for the dispatcher (BE-3).
--
-- The four "what is due right now" queries live here rather than in the Edge Function for
-- three reasons: they can use the partial indexes directly, they are testable with pgTAP
-- without deploying anything, and the timezone arithmetic stays next to the data instead of
-- being reimplemented in JavaScript.
--
-- Everything here is service-role only. A client that could call these could enumerate
-- other households' schedules.

-- ---------------------------------------------------------------------------
-- Quiet hours
-- ---------------------------------------------------------------------------
-- Suppresses break and meal pushes only; medication and appointment reminders are
-- health-critical and always fire. Handles windows that wrap midnight (22:00 -> 07:00).

create or replace function app.in_quiet_hours(p_household uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select case
    when h.quiet_hours_start is null or h.quiet_hours_end is null then false
    when h.quiet_hours_start < h.quiet_hours_end
      then (now() at time zone h.timezone)::time >= h.quiet_hours_start
       and (now() at time zone h.timezone)::time <  h.quiet_hours_end
    else                                            -- wraps midnight
         (now() at time zone h.timezone)::time >= h.quiet_hours_start
      or (now() at time zone h.timezone)::time <  h.quiet_hours_end
  end
  from public.households h
  where h.id = p_household;
$$;

-- ---------------------------------------------------------------------------
-- Due query 1 — break predictions (the flagship)
-- ---------------------------------------------------------------------------

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
         -- predicted_at pins the key to THIS cycle: once notify_at rolls forward, the
         -- next attempt produces a different key and is allowed through.
         'break:' || ps.pet_id || ':' || ps.break_type || ':' ||
           to_char(ps.predicted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')
    from public.prediction_state ps
    join public.pets p on p.id = ps.pet_id
   where ps.notify_at is not null
     and ps.notify_at <= now()
     and (ps.snoozed_until is null or ps.snoozed_until <= now())
     and p.archived_at is null
     and not app.in_quiet_hours(p.household_id);
$$;

-- After sending, roll notify_at forward one full cycle. Without this an unanswered push
-- would re-fire every single minute. predicted_at is deliberately left alone — it stays
-- put so the app can still show "overdue" (Δ7).
create or replace function public.mark_break_dispatched(
  p_pet_id uuid, p_break_type public.break_type, p_notification_id uuid
) returns void
language sql security definer set search_path = public as $$
  update public.prediction_state
     set notify_at = predicted_at + (hold_hours::double precision * interval '1 hour'),
         last_notification_id = p_notification_id,
         updated_at = now()
   where pet_id = p_pet_id and break_type = p_break_type;
$$;

-- ---------------------------------------------------------------------------
-- Due query 2 — meals
-- ---------------------------------------------------------------------------
-- A 90-second window absorbs cron jitter; the unique dedupe_key stops the overlap from
-- producing two pushes.

create or replace function public.due_meals()
returns table (
  household_id uuid,
  pet_id       uuid,
  pet_name     text,
  feed_time_id uuid,
  meal_label   text,
  dedupe_key   text
)
language sql security definer stable set search_path = public as $$
  select p.household_id,
         p.id,
         p.name,
         ft.id,
         coalesce(ft.label, 'Meal'),
         'meal:' || ft.id || ':' ||
           to_char(now() at time zone h.timezone, 'YYYY-MM-DD')
    from public.feed_times ft
    join public.pets p       on p.id = ft.pet_id
    join public.households h on h.id = p.household_id
   where ft.active
     and p.archived_at is null
     and (date_trunc('day', now() at time zone h.timezone) + ft.local_time)
           at time zone h.timezone
         between now() - interval '90 seconds' and now()
     and not app.in_quiet_hours(p.household_id)
     -- Don't nag for a meal that has already been logged today. This is what makes
     -- "Sarah fed the cat early" not produce a pointless reminder at 18:00.
     and not exists (
       select 1 from public.logs l
        where l.feed_time_id = ft.id
          and l.deleted_at is null
          and (l.occurred_at at time zone h.timezone)::date
              = (now() at time zone h.timezone)::date
     );
$$;

-- ---------------------------------------------------------------------------
-- Due query 3 — medications
-- ---------------------------------------------------------------------------
-- Same shape as meals, but never suppressed by quiet hours.

create or replace function public.due_medications()
returns table (
  household_id    uuid,
  pet_id          uuid,
  pet_name        text,
  medication_id   uuid,
  medication_name text,
  dosage          text,
  dedupe_key      text
)
language sql security definer stable set search_path = public as $$
  select p.household_id, p.id, p.name, m.id, m.name, m.dosage,
         'med:' || m.id || ':' || to_char(now() at time zone h.timezone, 'YYYY-MM-DD')
    from public.medications m
    join public.pets p       on p.id = m.pet_id
    join public.households h on h.id = p.household_id
   where m.active
     and p.archived_at is null
     and (date_trunc('day', now() at time zone h.timezone) + m.local_time)
           at time zone h.timezone
         between now() - interval '90 seconds' and now()
     and not exists (
       select 1 from public.logs l
        where l.medication_id = m.id
          and l.deleted_at is null
          and (l.occurred_at at time zone h.timezone)::date
              = (now() at time zone h.timezone)::date
     );
$$;

-- ---------------------------------------------------------------------------
-- Due query 4 — appointment reminders
-- ---------------------------------------------------------------------------
-- Single-table scan on idx_appt_reminders_due; this is why fire_at is denormalized.
-- No date in the dedupe key: a reminder is a one-shot.

create or replace function public.due_appointment_reminders()
returns table (
  household_id   uuid,
  pet_id         uuid,
  reminder_id    uuid,
  appointment_id uuid,
  title          text,
  starts_at      timestamptz,
  offset_minutes int,
  dedupe_key     text
)
language sql security definer stable set search_path = public as $$
  select a.household_id,
         (select ap.pet_id from public.appointment_pets ap
           where ap.appointment_id = a.id limit 1),
         r.id, a.id, a.title, a.starts_at, r.offset_minutes,
         'appt:' || r.id
    from public.appointment_reminders r
    join public.appointments a on a.id = r.appointment_id
   where r.sent_at is null
     and r.fire_at <= now()
     and a.deleted_at is null
     and a.completed_at is null;
$$;

create or replace function public.mark_reminder_sent(p_reminder_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.appointment_reminders set sent_at = now() where id = p_reminder_id;
$$;

-- ---------------------------------------------------------------------------
-- Idempotency gate 1 — claim a notification exactly once
-- ---------------------------------------------------------------------------
-- A function rather than an inline UPDATE so the compare-and-set is expressed in one
-- place and can be tested directly. Returns the row only if THIS caller won.

create or replace function public.claim_notification(
  p_notification_id uuid,
  p_action          text,
  p_action_by       uuid default null
) returns public.notifications
language plpgsql security definer set search_path = public as $$
declare v_row public.notifications;
begin
  update public.notifications
     set status    = 'actioned',
         action    = p_action,
         action_at = now(),
         action_by = p_action_by
   where id = p_notification_id
     -- 'superseded' (a manual log landed first) and 'actioned' (partner already
     -- answered) both fail to match. That is the entire two-caregiver guarantee.
     and status = 'sent'
  returning * into v_row;

  return v_row;   -- null when the claim was lost
end $$;

-- SNOOZE re-opens the notification so the next dispatch can claim it again.
create or replace function public.snooze_break(
  p_pet_id uuid, p_break_type public.break_type,
  p_notification_id uuid, p_minutes int default 15
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.prediction_state
     set snoozed_until = now() + make_interval(mins => p_minutes),
         notify_at     = now() + make_interval(mins => p_minutes),
         updated_at    = now()
   where pet_id = p_pet_id and break_type = p_break_type;

  update public.notifications
     set status = 'sent', action = null, action_at = null
   where id = p_notification_id;
end $$;

-- ---------------------------------------------------------------------------
-- Retention — notifications must not grow forever
-- ---------------------------------------------------------------------------
-- Roughly 32 rows/household/day. At 10k households that is ~120M rows/year, which does
-- not fit a small instance. A dedupe_key only needs to outlive its own window: break keys
-- are pinned to a predicted_at that is long past, daily keys to a date that cannot recur.
-- 90 days is far beyond any of them.

create or replace function app.prune_notifications() returns integer
language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  delete from public.notifications
   where created_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- ---------------------------------------------------------------------------
-- Reconciliation — the safety net for prediction_state
-- ---------------------------------------------------------------------------
-- prediction_state is a cache with extra mutable state. Every write path recomputes it via
-- trigger, but that protection is only as good as the trigger coverage: if a path is ever
-- missed, a row silently goes stale and that pet simply stops being reminded. No error, no
-- alert, just a feature that quietly stops working for one animal.
--
-- Recomputing every prediction nightly costs almost nothing and closes that hole.

create or replace function app.reconcile_predictions() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row     record;
  v_checked integer := 0;
begin
  for v_row in
    select p.id as pet_id, b.bt
      from public.pets p
      cross join (values ('pee'::public.break_type), ('poo'::public.break_type)) as b(bt)
     where p.archived_at is null
  loop
    perform app.recompute_prediction(v_row.pet_id, v_row.bt);
    v_checked := v_checked + 1;
  end loop;

  return v_checked;
end $$;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

do $$
declare v_job record;
begin
  for v_job in
    select * from (values
      ('prune-notifications',  '15 4 * * *', $q$select app.prune_notifications()$q$),
      ('reconcile-predictions','45 4 * * *', $q$select app.reconcile_predictions()$q$)
    ) as t(jobname, schedule, command)
  loop
    if exists (select 1 from cron.job where jobname = v_job.jobname) then
      perform cron.unschedule(v_job.jobname);
    end if;
    perform cron.schedule(v_job.jobname, v_job.schedule, v_job.command);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants — service role only, every one of them
-- ---------------------------------------------------------------------------

revoke execute on function
  public.due_break_predictions(), public.due_meals(), public.due_medications(),
  public.due_appointment_reminders(),
  public.mark_break_dispatched(uuid, public.break_type, uuid),
  public.mark_reminder_sent(uuid),
  public.claim_notification(uuid, text, uuid),
  public.snooze_break(uuid, public.break_type, uuid, int)
  from public, anon, authenticated;

grant execute on function
  public.due_break_predictions(), public.due_meals(), public.due_medications(),
  public.due_appointment_reminders(),
  public.mark_break_dispatched(uuid, public.break_type, uuid),
  public.mark_reminder_sent(uuid),
  public.claim_notification(uuid, text, uuid),
  public.snooze_break(uuid, public.break_type, uuid, int)
  to service_role;

revoke all on function app.in_quiet_hours(uuid), app.prune_notifications(),
                        app.reconcile_predictions()
  from public, anon, authenticated;
