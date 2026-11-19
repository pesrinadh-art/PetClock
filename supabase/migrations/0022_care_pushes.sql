-- 0022_care_pushes.sql
-- Phase 3 of docs/CARE_MODULES_PLAN.md ("0022+ (Phase 3)"): server-sent pushes for the walks
-- and habitat-cleaning modules.
--
-- The client copies of this maths are lib/care/modules/walks.ts (predictWalk) and
-- lib/care/modules/habitat.ts (habitatDue). Both copies are checked against the SAME inputs:
-- shared/fixtures/care_vectors.json drives lib/__tests__/careVectors.test.ts (client) and the
-- generated block of supabase/tests/012_care_pushes.sql (this file). Change one copy, change
-- the other, and regenerate with `node scripts/gen-care-parity-sql.js`.
--
--   1. public.care_state — one row per (pet, walks|habitat): when the next walk / clean is
--      due and when its push fires. Member-readable, never client-writable.
--   2. app.recompute_care(pet, module) — the single choke point, gated on app.module_enabled:
--        walks    due_at    = last live walk log + walk_interval_hours (null -> 4h default,
--                             DEFAULT_WALK_INTERVAL_HOURS), always exactly ONE interval after
--                             the anchor, even for a future-dated log (predictWalk).
--                 notify_at = due_at - clamp(round(hours * 60 * 0.10), 5, 20) min (WALK_BUFFER).
--        habitat  due_at    = 10:00 household time on (household-local date of the last live
--                             habitat_clean) + habitat_interval_days (HABITAT_REMINDER_LOCAL_TIME).
--                 notify_at = due_at (the reminder fires at 10:00 on the due date).
--      A missed walk / clean NEVER rolls forward (CLAUDE.md, Δ7): due_at stays put.
--   3. Triggers: walk / habitat_clean logs (insert, soft delete / restore, admin edits,
--      delete), pets (care_modules, both intervals, archived_at) and households.timezone all
--      recompute. A care log supersedes the in-flight care_due push for that pet + module, and
--      switching a module off (or archiving the pet) deletes its care_state and supersedes
--      its in-flight push, so a stale "Done" tap cannot write a log.
--   4. Dispatch support: due_care_items(), mark_care_dispatched(), snooze_care(), the
--      app-version gate (care_push_tokens) and a nightly reconcile_care() safety net.
--
-- HABITAT INTERVAL — why a NULL interval produces no server push.
-- The client resolves a null pets.habitat_interval_days to the SPECIES' suggested interval
-- (lib/care/species.ts: 7 days, 14 for snakes). The server cannot read the species table and
-- 0019 forbids species logic in SQL ("No species logic goes into SQL, ever"), so mirroring that
-- table here would create a second copy that can silently drift. The cleaner contract is that
-- the resolved interval is STORED on the pet when habitat is enabled (the app writes
-- suggestedHabitatDaysOf(profile) instead of null). Until it is, a pet with habitat on and a
-- null interval gets no care_state row and therefore no server push — it never gets a push at
-- the WRONG time. There are no production users, so there is nothing to backfill.
-- Walks have no species dependence (the default is a flat 4h), so a null walk interval is
-- mirrored here exactly.
--
-- DEDUPE KEYS — care:{pet}:{module}:{household-local due date}[:rN]
--   habitat  care:{pet}:habitat:YYYY-MM-DD           (the household-local due DATE)
--   walks    care:{pet}:walks:YYYY-MM-DDTHH24:MI     (household-local due date AND time —
--            several walks fall due on one day, so a date alone would let only the first push
--            of the day through)
-- ':rN' is appended only after a snooze re-ask, exactly like the break key (0017 §2). A key is
-- pinned to its cycle, so re-entering the due window can never send a second push.
--
-- APP-VERSION GATE. care_due pushes go only to notification_tokens whose app_version is at or
-- above app.care_push_min_app_version() — currently '1.1.0'. Builds older than that do not
-- know the care_due kind (Release N ignores it) and have no Done/Snooze category. The lead must
-- ship the Phase 3 client build as version 1.1.0 or later (app.json "version"), or change the
-- constant in a new migration. Tokens with a null or unparsable app_version are excluded.
--
-- Untouched (frozen): prediction_state, the break: key shape, recompute_prediction,
-- due_break_predictions, mark_break_dispatched, snooze_break, record_break_no,
-- app.on_log_insert / on_log_soft_delete / on_pet_schedule_change and their triggers.

-- ---------------------------------------------------------------------------
-- 1. care_state
-- ---------------------------------------------------------------------------

create table public.care_state (
  pet_id               uuid not null references public.pets(id) on delete cascade,
  module               public.care_module not null check (module in ('walks','habitat')),
  -- The last live log of the module's type: the anchor. Never null while a row exists.
  anchor_log_id        uuid references public.logs(id) on delete set null,
  anchor_at            timestamptz not null,
  -- The interval the row was computed with: hours for walks, days for habitat.
  interval_hours       numeric(4,1),
  interval_days        smallint,
  -- When the walk / clean is due. Stays put once passed (never rolls forward).
  due_at               timestamptz not null,
  buffer_minutes       int not null,
  -- When the push fires. NULL once this cycle's push has been dispatched.
  notify_at            timestamptz,
  snoozed_until        timestamptz,
  -- Increments on each snooze re-ask; participates in the dedupe key (as 0017 §2 for breaks).
  reask_seq            int not null default 0,
  last_notification_id uuid references public.notifications(id) on delete set null,
  updated_at           timestamptz not null default now(),
  primary key (pet_id, module),
  constraint care_state_interval_shape check (
    (module = 'walks'   and interval_hours is not null and interval_days is null) or
    (module = 'habitat' and interval_days  is not null and interval_hours is null)
  )
);

comment on table public.care_state is
  'Server authority for walk / habitat-cleaning due times (Phase 3). Mirrors predictWalk() '
  'and habitatDue() in lib/care/modules. Written only by app.recompute_care and the dispatch '
  'RPCs; members may read it.';

create index idx_care_state_due on public.care_state(notify_at) where notify_at is not null;

alter table public.care_state enable row level security;

create policy care_state_select on public.care_state for select
  using (app.is_member(app.pet_household(pet_id)));

-- Same lockdown as prediction_state (0010): readable by members, writable by nobody but the
-- service role and SECURITY DEFINER functions. Revoking the grants turns a would-be write into
-- a loud 42501 instead of a silent zero-row no-op.
revoke all on public.care_state from anon;
revoke insert, update, delete, truncate on public.care_state from authenticated;
grant select on public.care_state to authenticated;
grant all on public.care_state to service_role;

-- ---------------------------------------------------------------------------
-- 2. Constants and helpers
-- ---------------------------------------------------------------------------

-- The oldest app build that understands care_due pushes (Done/Snooze category, payload type).
-- Change it with `create or replace` in a NEW migration.
create or replace function app.care_push_min_app_version() returns text
language sql immutable as $$ select '1.1.0'::text $$;

-- Dotted-version comparison: '1.10.0' >= '1.9.2'. Missing parts read as 0 ('1.1' = '1.1.0');
-- a leading build-metadata-free numeric prefix is used ('1.2.0-beta' reads as 1.2.0). A null or
-- non-numeric version is never "at least" anything.
create or replace function app.version_at_least(p_version text, p_min text) returns boolean
language sql immutable as $$
  with v as (
    select substring(coalesce(p_version, '') from '^\s*v?(\d+(?:\.\d+){0,2})') as have,
           substring(coalesce(p_min, '')     from '^\s*v?(\d+(?:\.\d+){0,2})') as need
  )
  select case
    when have is null or need is null then false
    else array[
           split_part(have, '.', 1)::numeric,
           coalesce(nullif(split_part(have, '.', 2), ''), '0')::numeric,
           coalesce(nullif(split_part(have, '.', 3), ''), '0')::numeric
         ] >= array[
           split_part(need, '.', 1)::numeric,
           coalesce(nullif(split_part(need, '.', 2), ''), '0')::numeric,
           coalesce(nullif(split_part(need, '.', 3), ''), '0')::numeric
         ]
  end
  from v
$$;

-- The care module a log type belongs to (null for every other type). Modules never read each
-- other's logs (plan, "Guardrails" 3): walks <- 'walk', habitat <- 'habitat_clean'.
create or replace function app.care_module_for_log(p_type public.log_type)
returns public.care_module
language sql immutable as $$
  select case p_type::text
    when 'walk'          then 'walks'::public.care_module
    when 'habitat_clean' then 'habitat'::public.care_module
    else null
  end
$$;

-- Supersede every in-flight care_due push for (pet, module), except `p_keep` (the push a
-- notification tap is answering, so log-action's own claim is not stolen).
create or replace function app.supersede_care_pushes(
  p_pet uuid, p_module public.care_module, p_keep uuid default null
) returns void
language sql security definer set search_path = public as $$
  update public.notifications
     set status = 'superseded'
   where pet_id = p_pet
     and kind = 'care_due'
     and status = 'sent'
     and (data->>'careModule') = p_module::text
     and id is distinct from p_keep;
$$;

-- ---------------------------------------------------------------------------
-- 3. recompute_care — the single choke point
-- ---------------------------------------------------------------------------

create or replace function app.recompute_care(p_pet_id uuid, p_module public.care_module)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tz        text;
  v_walk_h    numeric(4,1);
  v_hab_days  smallint;
  v_log_type  public.log_type;
  v_anchor    timestamptz;
  v_log_id    uuid;
  v_due       timestamptz;
  v_buffer    int;
  v_hours     numeric(4,1);
  v_days      smallint;
begin
  if p_module not in ('walks','habitat') then
    return;   -- only walks and habitat have server due times
  end if;

  select h.timezone, p.walk_interval_hours, p.habitat_interval_days
    into v_tz, v_walk_h, v_hab_days
    from public.pets p
    join public.households h on h.id = p.household_id
   where p.id = p_pet_id and p.archived_at is null;

  -- Unknown or archived pet, or the module is switched off => no state, so no push.
  -- Mirrors the client plan resolving only the pet's stored careModules list.
  if v_tz is null or not app.module_enabled(p_pet_id, p_module) then
    delete from public.care_state where pet_id = p_pet_id and module = p_module;
    return;
  end if;

  v_log_type := case p_module when 'walks' then 'walk'::public.log_type
                              else 'habitat_clean'::public.log_type end;

  -- The anchor: the most recent non-deleted log of THIS module's type (lastWalk / lastClean).
  select l.occurred_at, l.id
    into v_anchor, v_log_id
    from public.logs l
   where l.pet_id = p_pet_id
     and l.type = v_log_type
     and l.deleted_at is null
   order by l.occurred_at desc, l.id
   limit 1;

  -- Nothing is predicted until the first walk / clean is logged.
  if v_log_id is null then
    delete from public.care_state where pet_id = p_pet_id and module = p_module;
    return;
  end if;

  if p_module = 'walks' then
    -- rhythmsForPet: null -> DEFAULT_WALK_INTERVAL_HOURS (4); clamp to 0.5..24 (the CHECK
    -- already enforces the range; the clamp keeps this a literal mirror).
    v_hours  := least(24, greatest(0.5, coalesce(v_walk_h, 4)));
    -- predictWalk: ALWAYS one interval after the last walk, never stepped further.
    v_due    := v_anchor + (v_hours::double precision * interval '1 hour');
    -- WALK_BUFFER = { fraction 0.10, min 5, max 20 } via bufferMsFor (numeric round: half up,
    -- as Math.round for these positive values).
    v_buffer := least(20, greatest(5, round(v_hours * 60 * 0.10)::int));
    v_days   := null;
  else
    -- See the header: no species defaults in SQL. A null interval means "not resolved yet".
    if v_hab_days is null then
      delete from public.care_state where pet_id = p_pet_id and module = p_module;
      return;
    end if;
    v_days   := least(90, greatest(1, v_hab_days));
    -- habitatDue: (household-local date of the last clean + N days) at 10:00 household time.
    v_due    := (((v_anchor at time zone v_tz)::date + v_days) + time '10:00') at time zone v_tz;
    v_buffer := 0;   -- the reminder fires AT due_at
    v_hours  := null;
  end if;

  insert into public.care_state as cs
        (pet_id, module, anchor_log_id, anchor_at, interval_hours, interval_days,
         due_at, buffer_minutes, notify_at, snoozed_until, reask_seq, updated_at)
  values (p_pet_id, p_module, v_log_id, v_anchor, v_hours, v_days,
          v_due, v_buffer, v_due - make_interval(mins => v_buffer), null, 0, now())
  on conflict (pet_id, module) do update
     set anchor_log_id  = excluded.anchor_log_id,
         anchor_at      = excluded.anchor_at,
         interval_hours = excluded.interval_hours,
         interval_days  = excluded.interval_days,
         due_at         = excluded.due_at,
         buffer_minutes = excluded.buffer_minutes,
         notify_at      = excluded.notify_at,
         snoozed_until  = null,
         reask_seq      = 0,
         updated_at     = now()
   -- Only when the cycle actually changed. A no-op recompute (nightly reconcile, an unrelated
   -- pet edit) must not re-arm a push that was already sent (notify_at null) or cancel a
   -- live snooze — that is what makes recompute idempotent.
   where cs.anchor_log_id  is distinct from excluded.anchor_log_id
      or cs.due_at         is distinct from excluded.due_at
      or cs.buffer_minutes is distinct from excluded.buffer_minutes;
end $$;

-- Recompute both modules for a pet (pets / households triggers and the nightly reconcile).
create or replace function app.recompute_care_all(p_pet_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.recompute_care(p_pet_id, 'walks');
  perform app.recompute_care(p_pet_id, 'habitat');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- Walk / habitat_clean logs. Separate from app.on_log_insert (frozen, pee/poo only).
--   insert            recompute, and supersede the in-flight push for the same module
--                     (except the push this log answers) — the break pattern from 0005.
--   soft delete/undo  recompute (an undone clean must not keep suppressing the reminder).
--   admin edits       recompute old and new (clients cannot change type/occurred_at: 0017 §3).
--   delete            recompute (cascade deletes find no pet and clear the row).
create or replace function app.on_care_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new_m public.care_module;
  v_old_m public.care_module;
begin
  if tg_op in ('INSERT','UPDATE') then
    v_new_m := app.care_module_for_log(new.type);
  end if;
  if tg_op in ('UPDATE','DELETE') then
    v_old_m := app.care_module_for_log(old.type);
  end if;

  if tg_op = 'INSERT' then
    if v_new_m is not null and new.deleted_at is null then
      perform app.recompute_care(new.pet_id, v_new_m);
      perform app.supersede_care_pushes(new.pet_id, v_new_m, new.notification_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_old_m is not null
       and (old.pet_id is distinct from new.pet_id or v_old_m is distinct from v_new_m) then
      perform app.recompute_care(old.pet_id, v_old_m);
    end if;
    if v_new_m is not null then
      perform app.recompute_care(new.pet_id, v_new_m);
    end if;
    return new;
  end if;

  -- DELETE
  if v_old_m is not null then
    perform app.recompute_care(old.pet_id, v_old_m);
  end if;
  return old;
end $$;

create trigger trg_logs_care_change
  after insert or delete or update of deleted_at, occurred_at, type, pet_id on public.logs
  for each row execute function app.on_care_log_change();

-- Pets: module switched on/off, an interval edited, archived / restored.
create or replace function app.on_pet_care_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_m public.care_module;
begin
  perform app.recompute_care_all(new.id);

  -- A module just switched off, or the pet was archived: a care push already on someone's lock
  -- screen must not be able to write a log ('superseded' cannot be claimed). Same mechanism as
  -- potty-off in 0019.
  foreach v_m in array array['walks','habitat']::public.care_module[] loop
    if (v_m = any(old.care_modules) and not (v_m = any(new.care_modules)))
       or (old.archived_at is null and new.archived_at is not null) then
      perform app.supersede_care_pushes(new.id, v_m, null);
    end if;
  end loop;

  return new;
end $$;

create trigger trg_pets_care_change
  after update of care_modules, walk_interval_hours, habitat_interval_days, archived_at
  on public.pets
  for each row execute function app.on_pet_care_change();

-- Households: the timezone decides habitat due dates (and the walk dedupe key's local date).
create or replace function app.on_household_tz_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pet uuid;
begin
  for v_pet in select id from public.pets where household_id = new.id loop
    perform app.recompute_care_all(v_pet);
  end loop;
  return new;
end $$;

create trigger trg_households_care_tz
  after update of timezone on public.households
  for each row
  when (old.timezone is distinct from new.timezone)
  execute function app.on_household_tz_change();

-- ---------------------------------------------------------------------------
-- 5. Dispatch support (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.due_care_items()
returns table (
  household_id   uuid,
  pet_id         uuid,
  pet_name       text,
  care_module    text,
  due_at         timestamptz,
  interval_hours numeric,
  interval_days  int,
  dedupe_key     text
)
language sql security definer stable set search_path = public as $$
  select p.household_id,
         cs.pet_id,
         p.name,
         cs.module::text,
         cs.due_at,
         cs.interval_hours,
         cs.interval_days::int,
         'care:' || cs.pet_id || ':' || cs.module || ':' ||
           case cs.module
             when 'habitat' then to_char(cs.due_at at time zone h.timezone, 'YYYY-MM-DD')
             else to_char(cs.due_at at time zone h.timezone, 'YYYY-MM-DD"T"HH24:MI')
           end ||
           case when cs.reask_seq > 0 then ':r' || cs.reask_seq else '' end
    from public.care_state cs
    join public.pets p       on p.id = cs.pet_id
    join public.households h on h.id = p.household_id
   where cs.notify_at is not null
     and cs.notify_at <= now()
     and (cs.snoozed_until is null or cs.snoozed_until <= now())
     and p.archived_at is null
     -- Belt and braces: recompute_care already deletes the row when the module is off.
     and app.module_enabled(cs.pet_id, cs.module)
     -- Walks and cleaning are not health-critical: quiet hours defer them, as for breaks.
     and not app.in_quiet_hours(p.household_id);
$$;

-- After sending: this cycle's push is done. notify_at goes NULL (due_at stays put, so the app
-- still reads "overdue"); the next push comes from a new log (new cycle) or a snooze re-ask.
create or replace function public.mark_care_dispatched(
  p_pet_id uuid, p_module text, p_notification_id uuid
) returns void
language sql security definer set search_path = public as $$
  update public.care_state
     set notify_at            = null,
         snoozed_until        = null,
         last_notification_id = p_notification_id,
         updated_at           = now()
   where pet_id = p_pet_id and module = p_module;
$$;

-- "Snooze" on a care push: re-ask in p_minutes with a fresh dedupe key (reask_seq), and re-open
-- the claimed notification so the other caregiver's copy can still be answered — the
-- snooze_break semantics (0017 §2), scoped to this pet's care_due push for this module.
create or replace function public.snooze_care(
  p_pet_id uuid, p_module text, p_notification_id uuid, p_minutes int default 15
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.care_state
     set snoozed_until = now() + make_interval(mins => p_minutes),
         notify_at     = now() + make_interval(mins => p_minutes),
         reask_seq     = reask_seq + 1,
         updated_at    = now()
   where pet_id = p_pet_id and module = p_module;

  update public.notifications n
     set status = 'sent', action = null, action_at = null
   where n.id = p_notification_id
     and n.pet_id = p_pet_id
     and n.kind = 'care_due'
     and (n.data->>'careModule') = p_module
     -- Never resurrect a push that a real log superseded: the question was answered.
     and n.status = 'actioned';
end $$;

-- Recipients for a care_due push: live household members' unrevoked tokens on a build that
-- understands care_due (the app-version gate). Expired walkers are excluded, as in the
-- dispatcher's general lookup.
create or replace function public.care_push_tokens(p_household_id uuid)
returns table (expo_push_token text)
language sql security definer stable set search_path = public as $$
  select t.expo_push_token
    from public.notification_tokens t
    join public.household_members m on m.user_id = t.user_id
   where m.household_id = p_household_id
     and (m.member_expires_at is null or m.member_expires_at > now())
     and t.revoked_at is null
     and app.version_at_least(t.app_version, app.care_push_min_app_version());
$$;

-- ---------------------------------------------------------------------------
-- 6. Nightly reconcile — the same safety net as reconcile_predictions (0011)
-- ---------------------------------------------------------------------------

create or replace function app.reconcile_care() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_pet     uuid;
  v_checked integer := 0;
begin
  for v_pet in select id from public.pets where archived_at is null loop
    perform app.recompute_care_all(v_pet);
    v_checked := v_checked + 1;
  end loop;
  -- Rows for archived pets (archiving recomputes, so this is only a backstop).
  delete from public.care_state cs
   using public.pets p
   where p.id = cs.pet_id and p.archived_at is not null;
  return v_checked;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reconcile-care') then
    perform cron.unschedule('reconcile-care');
  end if;
  perform cron.schedule('reconcile-care', '50 4 * * *', $q$select app.reconcile_care()$q$);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.due_care_items(),
  public.mark_care_dispatched(uuid, text, uuid),
  public.snooze_care(uuid, text, uuid, int),
  public.care_push_tokens(uuid)
  from public, anon, authenticated;

grant execute on function
  public.due_care_items(),
  public.mark_care_dispatched(uuid, text, uuid),
  public.snooze_care(uuid, text, uuid, int),
  public.care_push_tokens(uuid)
  to service_role;

revoke all on function
  app.care_push_min_app_version(),
  app.version_at_least(text, text),
  app.care_module_for_log(public.log_type),
  app.supersede_care_pushes(uuid, public.care_module, uuid),
  app.recompute_care(uuid, public.care_module),
  app.recompute_care_all(uuid),
  app.reconcile_care()
  from public, anon, authenticated;
