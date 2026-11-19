-- 0018_prediction_parity.sql
-- Phase 0.5 parity fix (docs/CARE_MODULES_PLAN.md, "0018_prediction_parity.sql").
--
-- Defect: app.recompute_prediction (latest body: 0017) applied the nextRepeating() branch
-- "anchor in the future => predicted := anchor" to EVERY anchor, including a real log. The
-- client (lib/petSchedule.ts predictBreak) predicts `log + hold` after any real log, because
-- that branch is only correct for the feed-time fallback anchor (a stand-in "wake time" that
-- may still be ahead today). For a log dated even slightly in the future (device clock skew,
-- a caregiver back-dating a walk the "wrong" way) the server predicted the log instant itself,
-- so the push fired ~immediately while the app showed log + hold.
--
-- Observed: golden vector v07_log_future (shared/fixtures/prediction_vectors.json) — pee
-- logged 30 min ahead with a 4h hold: client predicted +4h30m, server predicted +30m.
--
-- Fix: the "> now()" branch now applies only when the anchor is the feed-time fallback
-- (v_last_log is null). A log anchor always predicts log + hold. Everything else is restated
-- verbatim from 0017 (migrations are immutable; this is a fix-forward).

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

  if v_last_log is not null then
    -- A real log anchor: the next break is ALWAYS one hold-interval later, even when the
    -- log is dated in the future (mirrors predictBreak's log branch in lib/petSchedule.ts).
    v_predicted := v_anchor + (v_hold::double precision * interval '1 hour');
  elsif v_anchor > now() then
    -- Feed-time fallback anchor still ahead today: predict at the anchor (nextRepeating()).
    v_predicted := v_anchor;
  else
    -- nextRepeating() — steps AT MOST one interval past the anchor (Δ7).
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
