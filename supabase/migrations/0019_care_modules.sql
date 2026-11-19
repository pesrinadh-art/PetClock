-- 0019_care_modules.sql
-- Phase 1 of docs/CARE_MODULES_PLAN.md ("0019_care_modules.sql").
--
-- Each pet stores an EXPLICIT list of the care it gets help with. The list is never "use the
-- species defaults": the server cannot read the app's species table (lib/care/species.ts), so
-- read-time defaults would let the phone and the server disagree about whether a potty push
-- should fire. No species logic goes into SQL, ever.
--
--   1. public.care_module — a text DOMAIN with a CHECK, not an enum: an enum value can never be
--      removed and cannot be used in the transaction that adds it; a domain CHECK can be
--      redefined inside one migration. 'walks' and 'habitat' are accepted now; their modules
--      ship in Phase 2.
--   2. pets.care_modules, backfilled and defaulted to exactly today's behaviour
--      ({potty,meals,meds,visits}). Existing pets gain nothing new.
--   3. app.module_enabled(pet, module).
--   4. app.recompute_prediction restated IN FULL from 0018 plus one gate: with potty off there
--      is no prediction_state row. That is the single choke point — the log/pet/feed-time
--      triggers, due_break_predictions, mark_break_dispatched, snooze_break, record_break_no
--      and reconcile_predictions all read or update prediction_state, so they inherit the gate.
--   5. trg_pets_schedule_change also fires on care_modules; switching potty off supersedes any
--      in-flight 'sent' break push so a stale tap cannot write a log.
--
-- Walkers cannot change care_modules: pets_update (0006) is `using/with check
-- app.is_editor(household_id)`, and is_editor admits only 'owner' and 'member'. No new policy
-- is needed; 010_care_modules.sql proves it.
--
-- Untouched (frozen): break_type, the prediction_state PK, the break: dedupe key shape,
-- mark_break_dispatched, snooze_break, record_break_no, reask_seq, the log-action break path,
-- and the p_type::text::public.log_type cast.

-- ---------------------------------------------------------------------------
-- 1. The module id domain
-- ---------------------------------------------------------------------------

create domain public.care_module as text
  check (value in ('potty','walks','meals','meds','visits','habitat'));

comment on domain public.care_module is
  'A kind of care a pet gets help with. Mirrors CareModuleId in lib/db/models.ts. '
  'A domain (not an enum) so the set can be redefined in one migration.';

-- ---------------------------------------------------------------------------
-- 2. pets.care_modules
-- ---------------------------------------------------------------------------

-- `not null default` backfills every existing row with today's behaviour in the same statement.
alter table public.pets add column care_modules public.care_module[] not null
  default '{potty,meals,meds,visits}';

-- A NULL element would pass the domain CHECK (NULL is not false); the app never writes one.
alter table public.pets add constraint pets_care_modules_no_nulls
  check (array_position(care_modules, null) is null);

comment on column public.pets.care_modules is
  'Explicit list of enabled care modules. Written by editors (pets_update RLS; walkers cannot). '
  'Backfill/default = today''s behaviour. app.recompute_prediction gates on ''potty''.';

-- ---------------------------------------------------------------------------
-- 3. app.module_enabled
-- ---------------------------------------------------------------------------

create or replace function app.module_enabled(p_pet uuid, p_m public.care_module)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_m = any(care_modules) from public.pets where id = p_pet), false)
$$;

revoke execute on function app.module_enabled(uuid, public.care_module) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. recompute_prediction — 0018 body, verbatim, plus the potty gate
-- ---------------------------------------------------------------------------

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

  -- 0019: the potty module is switched off for this pet => no prediction, so no push.
  -- Mirrors potty.status()/reminders() on the client returning nothing (lib/care/modules/potty.ts).
  if not app.module_enabled(p_pet_id, 'potty') then
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

-- ---------------------------------------------------------------------------
-- 5. Pet schedule trigger: also on care_modules, and supersede on potty-off
-- ---------------------------------------------------------------------------

create or replace function app.on_pet_schedule_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.recompute_prediction(new.id, 'pee');
  perform app.recompute_prediction(new.id, 'poo');

  -- Potty just switched off: a break push already on someone's lock screen must not be able
  -- to write a log. 'superseded' cannot be claimed (claim_notification), so a late tap is a
  -- no-op — the same mechanism a manual log uses (app.on_log_insert).
  if tg_op = 'UPDATE'
     and 'potty' = any(old.care_modules)
     and not ('potty' = any(new.care_modules)) then
    update public.notifications
       set status = 'superseded'
     where pet_id = new.id
       and kind = 'break_prediction'
       and status = 'sent';
  end if;

  return new;
end $$;

drop trigger trg_pets_schedule_change on public.pets;

create trigger trg_pets_schedule_change
  after update of pee_hold_hours, poop_hold_hours, archived_at, care_modules on public.pets
  for each row execute function app.on_pet_schedule_change();
