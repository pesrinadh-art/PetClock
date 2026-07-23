# PawClock — Backend Implementation Plan

**Prepared by:** Sr. Backend Engineer review (2026-07-23)
**Flagship directive:** actionable push at predicted pee/poo break time ("Did Mochi go? Yes / No / Snooze"), one-tap server-side log write, automatic re-prediction.
**Owner:** BE dev · **Track:** independent — see [`PLAN.md`](../PLAN.md) §4 for how this
runs in parallel with [`FRONTEND_PLAN.md`](FRONTEND_PLAN.md) and where the two
tracks meet (SYNC 1–4)

Every milestone below (BE-1 → BE-5) needs nothing from the RN app to build or
verify — every table, trigger, and Edge Function is testable with
`supabase db reset`, `psql`, `curl`, and pgTAP against the local Docker
stack. The schema in §2 and the notification payload contract in §3.4 are
the frozen handoff — the FE track already builds its client types and
notification categories to these exact shapes, so integration at the sync
points is wiring, not rework.

---

## 0. Audit summary — what exists today and what's wrong with it

### Current state (verified in code)

| Concern | Where | Status |
|---|---|---|
| Pets CRUD | `context/PetsContext.tsx` | In-memory `useState`, seeded from `mockData.pets`; IDs are `name-slug-${Date.now()}` |
| Logs (pee/poo/food/vet) | `context/LogsContext.tsx` | In-memory, append-only; IDs are `${type}-${ts}-${rand5}` |
| Appointments | `context/AppointmentsContext.tsx` | In-memory; ID `appt-${Date.now()}` (collision-prone) |
| Prediction engine | `lib/petSchedule.ts` | Pure client functions: `getUpcomingForPet` (anchor = last pee/poo log, + hold hours, ±15% buffer clamped 10–45 min), `inferScheduleFromLogs` (avg interval ≤ 12 h, ≥2 pee + ≥2 poo + ≥1 food logs) |
| Countdown/date logic | `lib/appointmentUtils.ts` | `new Date("Fri, Jul 4" + time)` free-form parsing |
| Persistence / Auth / sync / push | none | App restart loses everything |

### Modeling flaws to fix in the backend schema

1. **Appointments store display strings, not references** — `petNames: string[]` holds `"🐶 Mochi"`. → Fix: `appointment_pets(appointment_id, pet_id)` join table.
2. **Countdown is materialized at creation time** and goes stale. → Fix: store only `starts_at timestamptz`; countdown is a pure client render function.
3. **Dates are free-form strings with no year** (`'Fri, Jul 4'`, `'Was Jun 20'`). → Fix: `starts_at timestamptz not null` + `all_day boolean`.
4. **Age is a static display string** (`'2 yrs'`). → Fix: `birthdate date`, age computed client-side.
5. **`meta` is denormalized display text** — drop it, render from breed + birthdate.
6. **Logs store presentation** (`icon`, `label`, formatted `time`) — keep only `type`, `occurred_at`, `note`.
7. **Feed/med times are 12-hour strings** parsed by regex — store Postgres `time` + household IANA timezone.
8. **`add-appointment.tsx` silently discards reminder choices** — fix with `appointment_reminders(offset_minutes)` rows.
9. **IDs from `Date.now()`** collide across devices → all IDs become client-generated UUID v4 (also the key to offline-first idempotency).
10. **Calibration countdown keyed to `createdAt`** — keep as `calibration_started_at timestamptz`; inference moves server-side so it works from any household member's logs.

---

## 1. Tech choice: Supabase (committed)

### Decision matrix (for THIS app: solo dev, Expo managed, auth + realtime household sync + server-scheduled push)

| Criterion | Supabase | Firebase | Custom Node + Postgres |
|---|---|---|---|
| Relational fit (households → pets → logs, interval math for calibration) | **A** — real Postgres, SQL window functions | C — Firestore forces denormalization | A |
| Multi-tenant authorization | **A** — RLS, one `is_household_member()` helper | B — security rules hard to get right for shared households | B — hand-rolled |
| Scheduled server jobs (per-minute prediction scan) | **A** — `pg_cron` + Edge Functions | B — Cloud Scheduler, needs Blaze plan | B — you now operate a worker host |
| Push to Expo | A — Edge Function → Expo Push API | A | A |
| Realtime household sync | **A** — Postgres Changes, RLS-authorized | A — Firestore listeners best-in-class | C — build your own WS layer |
| Anonymous → full account upgrade | **A** — `signInAnonymously()` + `linkIdentity()` keeps same uid | A | C |
| Local dev | **A** — `supabase start` full stack in Docker | B | B |
| Solo-dev ops burden | **A** — managed, free tier suffices | A | **D** |
| Type safety | A — `supabase gen types typescript` | C | B |
| Lock-in / exit | A — it's Postgres, `pg_dump` and leave | C | A |

**Verdict: Supabase.** The core loop — "scan every household's prediction state each minute, join member push tokens, send, write an idempotent audit row, recompute on log insert" — is a *relational, cron-driven* problem: Postgres triggers + `pg_cron` + one Edge Function express it in ~300 lines.

Client packages: `@supabase/supabase-js`, `expo-notifications`, `expo-device`, `expo-sqlite` (offline cache), `expo-secure-store` (session), `expo-apple-authentication`, `@react-native-google-signin/google-signin`.

---

## 2. Database schema (complete DDL)

All app tables in `public`, internal helpers in schema `app` (not exposed via PostgREST). Migrations in `supabase/migrations/`.

```sql
-- 0001_extensions.sql
create extension if not exists pg_cron  with schema pg_catalog;
create extension if not exists pg_net;          -- cron -> edge function HTTP calls
create schema if not exists app;

-- 0002_enums.sql
create type public.species    as enum ('dog','cat','rabbit','hamster','bird','turtle','snake','fish','other');
create type public.log_type   as enum ('pee','poo','food','medication','vet','other');
create type public.log_source as enum ('manual','notification_yes','backfill','import','system');
create type public.appt_type  as enum ('vet','groom','vaccine','other');
create type public.break_type as enum ('pee','poo');
create type public.notif_kind as enum ('break_prediction','meal','medication','appointment','digest','med_escalation');
create type public.notif_status as enum ('sent','actioned','dismissed','superseded','failed');
create type public.member_role  as enum ('owner','member');
```

```sql
-- 0003_core.sql ----------------------------------------------------------

-- Mirrors auth.users 1:1; created by trigger on signup.
create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_emoji  text default '🙂',
  created_at    timestamptz not null default now()
);

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My Household',
  -- IANA tz; all local-time scheduling math resolves through this.
  timezone    text not null default 'America/Los_Angeles'
              check ( (now() at time zone timezone) is not null ),   -- rejects bad tz names
  quiet_hours_start time,        -- e.g. 22:00 — suppress non-critical pushes
  quiet_hours_end   time,        -- e.g. 07:00
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index idx_members_user on public.household_members(user_id);

create table public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  code          text not null unique
                default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  created_by    uuid not null references auth.users(id) on delete cascade,
  expires_at    timestamptz not null default now() + interval '7 days',
  max_uses      int not null default 5,
  use_count     int not null default 0,
  revoked_at    timestamptz
);

create table public.pets (
  id            uuid primary key default gen_random_uuid(),   -- client-generated allowed
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  avatar_emoji  text not null default '🐶',
  species       public.species not null default 'other',
  breed         text,
  birthdate     date,                          -- FIX: replaces static "2 yrs" string
  weight_kg     numeric(5,2),
  pee_hold_hours  numeric(4,1) check (pee_hold_hours  between 0.5 and 24),
  poop_hold_hours numeric(4,1) check (poop_hold_hours between 0.5 and 24),
  calibration_started_at timestamptz not null default now(),
  archived_at   timestamptz,                   -- soft delete; history survives
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
create index idx_pets_household on public.pets(household_id) where archived_at is null;

create table public.feed_times (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  local_time  time not null,                   -- FIX: was '7:30 AM' string; tz from household
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pet_id, local_time)
);

create table public.medications (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  name        text not null,
  dosage      text,
  local_time  time not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_meds_pet on public.medications(pet_id) where active;

-- Append-only event log. No icon/label/formatted-time columns — presentation is client-side.
create table public.logs (
  id             uuid primary key,             -- CLIENT-generated uuid v4 => offline idempotency
  household_id   uuid not null references public.households(id) on delete cascade,
  pet_id         uuid not null references public.pets(id) on delete cascade,
  type           public.log_type not null,
  occurred_at    timestamptz not null default now(),
  note           text check (length(note) <= 280),      -- was `sub`
  source         public.log_source not null default 'manual',
  notification_id uuid,                                  -- set when written via push action
  medication_id  uuid references public.medications(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz                              -- soft delete = undo support + sync tombstone
);
create index idx_logs_pet_type_time on public.logs(pet_id, type, occurred_at desc);
create index idx_logs_household_time on public.logs(household_id, occurred_at desc);
create index idx_logs_sync on public.logs(household_id, created_at);  -- pull-sync cursor

create table public.appointments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type         public.appt_type not null default 'vet',
  title        text not null,
  starts_at    timestamptz not null,           -- FIX: real timestamp, no stored countdown
  all_day      boolean not null default false,
  location     text,
  notes        text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index idx_appts_household_time on public.appointments(household_id, starts_at)
  where deleted_at is null;

-- FIX: replaces petNames display strings
create table public.appointment_pets (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  pet_id         uuid not null references public.pets(id) on delete cascade,
  primary key (appointment_id, pet_id)
);

-- FIX: persists the four reminder toggles add-appointment.tsx currently throws away
create table public.appointment_reminders (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  offset_minutes int  not null check (offset_minutes >= 0),  -- 10080 / 1440 / 120
  fire_at        timestamptz not null,   -- maintained by trigger = starts_at - offset
  sent_at        timestamptz,
  unique (appointment_id, offset_minutes)
);
create index idx_appt_reminders_due on public.appointment_reminders(fire_at)
  where sent_at is null;
```

```sql
-- 0004_push_and_predictions.sql -------------------------------------------

create table public.notification_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_id    text not null,                -- stable per-install id (SecureStore uuid)
  expo_push_token text not null,             -- 'ExponentPushToken[...]'
  platform     text not null check (platform in ('ios','android')),
  app_version  text,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,                  -- set on DeviceNotRegistered receipt
  unique (user_id, device_id)                -- rotation = upsert on this key
);
create index idx_tokens_user on public.notification_tokens(user_id) where revoked_at is null;

-- One row per (pet, pee|poo). The heart of the flagship feature.
create table public.prediction_state (
  pet_id        uuid not null references public.pets(id) on delete cascade,
  break_type    public.break_type not null,
  anchor_at     timestamptz,        -- last relevant log time (or earliest feed time fallback)
  hold_hours    numeric(4,1),       -- snapshot of pets.*_hold_hours used for this prediction
  predicted_at  timestamptz,        -- anchor + hold, rolled forward past now
  buffer_minutes int,               -- clamp(hold*60*0.15, 10, 45)  (mirrors bufferMsFor)
  notify_at     timestamptz,        -- predicted_at - buffer => when the push fires
  snoozed_until timestamptz,        -- SNOOZE action
  last_log_id   uuid,
  last_notification_id uuid,
  consecutive_no_count int not null default 0,   -- LOG_NO streak -> hold-hour drift signal
  updated_at    timestamptz not null default now(),
  primary key (pet_id, break_type)
);
create index idx_prediction_due on public.prediction_state(notify_at)
  where notify_at is not null;

-- Audit + idempotency spine for every push ever sent.
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  pet_id        uuid references public.pets(id) on delete cascade,
  kind          public.notif_kind not null,
  -- e.g. 'break:PETID:pee:2026-07-23T18:30Z' | 'meal:FEEDTIMEID:2026-07-23'
  --      'med:MEDID:2026-07-23' | 'appt:REMINDERID'
  dedupe_key    text not null unique,          -- <- send-exactly-once guarantee
  title         text not null,
  body          text not null,
  data          jsonb not null default '{}',
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  status        public.notif_status not null default 'sent',
  action        text,                          -- 'LOG_YES' | 'LOG_NO' | 'SNOOZE_15' | 'OPEN'
  action_at     timestamptz,
  action_by     uuid references auth.users(id) on delete set null,
  expo_tickets  jsonb,                         -- [{token, ticketId|error}]
  created_at    timestamptz not null default now()
);
create index idx_notifications_household on public.notifications(household_id, created_at desc);
```

### Triggers and server-side prediction functions

```sql
-- 0005_functions_triggers.sql ---------------------------------------------

-- Generic updated_at maintenance
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger trg_touch_pets      before update on public.pets         for each row execute function app.touch_updated_at();
create trigger trg_touch_appts     before update on public.appointments  for each row execute function app.touch_updated_at();
create trigger trg_touch_feed      before update on public.feed_times    for each row execute function app.touch_updated_at();
create trigger trg_touch_meds      before update on public.medications   for each row execute function app.touch_updated_at();

-- Keep appointment_reminders.fire_at in sync when an appointment is rescheduled
create or replace function app.sync_reminder_fire_at() returns trigger
language plpgsql as $$
begin
  update public.appointment_reminders r
     set fire_at = new.starts_at - make_interval(mins => r.offset_minutes),
         sent_at = case when new.starts_at <> old.starts_at then null else r.sent_at end
   where r.appointment_id = new.id;
  return new;
end $$;
create trigger trg_appt_reschedule after update of starts_at on public.appointments
  for each row execute function app.sync_reminder_fire_at();

-- Profile bootstrap on signup (incl. anonymous users)
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Pet parent'));
  return new;
end $$;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ===== THE CORE: recompute a pet's break prediction ======================
-- Server-side port of lib/petSchedule.ts getUpcomingForPet()'s addHoldItem:
--   anchor = last pee/poo log, else today's earliest feed time (household-local);
--   predicted = nextRepeating(anchor, hold_hours); buffer = clamp(15% of hold, 10..45 min).
create or replace function app.recompute_prediction(p_pet_id uuid, p_type public.break_type)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hold numeric(4,1);
  v_household uuid;
  v_tz text;
  v_anchor timestamptz;
  v_predicted timestamptz;
  v_buffer int;
  v_last_log uuid;
begin
  select case p_type when 'pee' then p.pee_hold_hours else p.poop_hold_hours end,
         p.household_id, h.timezone
    into v_hold, v_household, v_tz
    from public.pets p join public.households h on h.id = p.household_id
   where p.id = p_pet_id and p.archived_at is null;

  if v_hold is null then
    delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
    return;
  end if;

  select l.occurred_at, l.id into v_anchor, v_last_log
    from public.logs l
   where l.pet_id = p_pet_id and l.type = p_type::text::public.log_type
     and l.deleted_at is null
   order by l.occurred_at desc limit 1;

  if v_anchor is null then
    -- fallback: earliest feed time today in household-local tz (mirrors scheduleAnchor)
    select (date_trunc('day', now() at time zone v_tz) + min(ft.local_time)) at time zone v_tz
      into v_anchor
      from public.feed_times ft where ft.pet_id = p_pet_id and ft.active;
    if v_anchor is null then
      delete from public.prediction_state where pet_id = p_pet_id and break_type = p_type;
      return;
    end if;
  end if;

  v_predicted := v_anchor + make_interval(hours => v_hold::float);
  while v_predicted <= now() loop                       -- nextRepeating()
    v_predicted := v_predicted + make_interval(hours => v_hold::float);
  end loop;
  v_buffer := least(45, greatest(10, round(v_hold * 60 * 0.15)));  -- bufferMsFor()

  insert into public.prediction_state as ps
        (pet_id, break_type, anchor_at, hold_hours, predicted_at, buffer_minutes,
         notify_at, snoozed_until, last_log_id, updated_at)
  values (p_pet_id, p_type, v_anchor, v_hold, v_predicted, v_buffer,
          v_predicted - make_interval(mins => v_buffer), null, v_last_log, now())
  on conflict (pet_id, break_type) do update
     set anchor_at = excluded.anchor_at,
         hold_hours = excluded.hold_hours,
         predicted_at = excluded.predicted_at,
         buffer_minutes = excluded.buffer_minutes,
         notify_at = excluded.notify_at,
         snoozed_until = null,
         last_log_id = excluded.last_log_id,
         consecutive_no_count = case when excluded.last_log_id is distinct from ps.last_log_id
                                     then 0 else ps.consecutive_no_count end,
         updated_at = now();
end $$;

-- Re-predict after every pee/poo log (manual OR notification-driven).
-- Also supersedes any in-flight notification for that break so the other
-- household member's stale push can't double-log.
create or replace function app.on_log_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('pee','poo') then
    perform app.recompute_prediction(new.pet_id, new.type::text::public.break_type);
    update public.notifications
       set status = 'superseded'
     where pet_id = new.pet_id and kind = 'break_prediction'
       and status = 'sent'
       and (data->>'breakType') = new.type::text
       and id is distinct from new.notification_id;
  end if;
  return new;
end $$;
create trigger trg_logs_after_insert after insert on public.logs
  for each row execute function app.on_log_insert();

-- Re-predict when hold hours / feed times change
create or replace function app.on_pet_schedule_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.recompute_prediction(new.id, 'pee');
  perform app.recompute_prediction(new.id, 'poo');
  return new;
end $$;
create trigger trg_pets_schedule_change
  after update of pee_hold_hours, poop_hold_hours on public.pets
  for each row execute function app.on_pet_schedule_change();
```

### RLS policies

```sql
-- 0006_rls.sql ------------------------------------------------------------
-- SECURITY DEFINER membership check avoids recursive-policy problems.
create or replace function app.is_member(p_household uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.household_members
                  where household_id = p_household and user_id = auth.uid());
$$;

-- enable RLS on every table (profiles, households, household_members, household_invites,
-- pets, feed_times, medications, logs, appointments, appointment_pets,
-- appointment_reminders, notification_tokens, notifications, prediction_state)

-- profiles: self + fellow household members (to show "logged by Alex")
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or exists (select 1 from public.household_members m1
             join public.household_members m2 using (household_id)
             where m1.user_id = auth.uid() and m2.user_id = profiles.user_id));
create policy profiles_update on public.profiles for update using (user_id = auth.uid());

create policy households_select on public.households for select using (app.is_member(id));
create policy households_update on public.households for update using (
  exists (select 1 from public.household_members
          where household_id = id and user_id = auth.uid() and role = 'owner'));
create policy households_insert on public.households for insert
  with check (created_by = auth.uid());

create policy members_select on public.household_members for select
  using (app.is_member(household_id));
create policy members_delete on public.household_members for delete using (
  user_id = auth.uid()                                   -- leave household
  or exists (select 1 from public.household_members       -- owner removes member
             where household_id = household_members.household_id
               and user_id = auth.uid() and role = 'owner'));
-- INSERT into household_members happens ONLY via SECURITY DEFINER RPCs
-- (create_household_with_membership, redeem_invite) — no direct policy.

create policy invites_select on public.household_invites for select using (app.is_member(household_id));
create policy invites_insert on public.household_invites for insert
  with check (app.is_member(household_id) and created_by = auth.uid());
create policy invites_update on public.household_invites for update using (app.is_member(household_id));

-- Standard household-scoped CRUD for domain tables
create policy pets_all on public.pets for all
  using (app.is_member(household_id)) with check (app.is_member(household_id));

create policy feed_times_all on public.feed_times for all
  using (exists (select 1 from public.pets p where p.id = pet_id and app.is_member(p.household_id)))
  with check (exists (select 1 from public.pets p where p.id = pet_id and app.is_member(p.household_id)));
-- (identical shape for medications)

create policy logs_select on public.logs for select using (app.is_member(household_id));
create policy logs_insert on public.logs for insert with check (
  app.is_member(household_id)
  and created_by = auth.uid()
  and exists (select 1 from public.pets p where p.id = pet_id and p.household_id = logs.household_id));
create policy logs_update on public.logs for update          -- soft-delete/undo only
  using (app.is_member(household_id));

create policy appts_all on public.appointments for all
  using (app.is_member(household_id)) with check (app.is_member(household_id));
-- appointment_pets / appointment_reminders: scoped via parent appointment (same EXISTS shape)

create policy tokens_all on public.notification_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- read-only to members; only service role (bypasses RLS) writes these
create policy notifications_select on public.notifications for select using (app.is_member(household_id));
create policy prediction_select on public.prediction_state for select
  using (exists (select 1 from public.pets p where p.id = pet_id and app.is_member(p.household_id)));
```

### RPCs (SECURITY DEFINER — the only paths that mutate membership)

```sql
-- 0007_rpcs.sql
create or replace function public.create_household_with_membership(p_name text, p_timezone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.households(name, timezone, created_by)
       values (coalesce(nullif(trim(p_name),''),'My Household'), p_timezone, auth.uid())
    returning id into v_id;
  insert into public.household_members(household_id, user_id, role)
       values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_household uuid;
begin
  update public.household_invites
     set use_count = use_count + 1
   where code = upper(trim(p_code))
     and revoked_at is null and expires_at > now() and use_count < max_uses
  returning household_id into v_household;
  if v_household is null then raise exception 'INVITE_INVALID' using errcode = 'P0001'; end if;
  insert into public.household_members(household_id, user_id, role)
       values (v_household, auth.uid(), 'member')
       on conflict do nothing;
  return v_household;
end $$;

-- Server-side port of inferScheduleFromLogs(): avg interval of gaps <= 12h,
-- rounded to nearest 0.5h, min 1h; requires >=2 pee, >=2 poo, >=1 food (14-day window).
create or replace function public.infer_schedule(p_pet_id uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  with gaps as (
    select type,
           extract(epoch from occurred_at - lag(occurred_at) over
                   (partition by type order by occurred_at)) / 3600.0 as h
      from public.logs
     where pet_id = p_pet_id and type in ('pee','poo') and deleted_at is null
       and occurred_at > now() - interval '14 days'),
  holds as (
    select type, greatest(1, round(avg(h) * 2) / 2.0) as hold, count(*) as n
      from gaps where h > 0 and h <= 12 group by type),
  feeds as (
    select array_agg(to_char(t, 'HH24:MI') order by t) as times from (
      select (occurred_at at time zone h.timezone)::time as t
        from public.logs l join public.pets p on p.id = l.pet_id
        join public.households h on h.id = p.household_id
       where l.pet_id = p_pet_id and l.type = 'food' and l.deleted_at is null
       order by l.occurred_at desc limit 3) s)
  select case when (select hold from holds where type='pee') is null
              or (select hold from holds where type='poo') is null
              or (select times from feeds) is null
         then null
         else jsonb_build_object(
           'peeHoldHours',  (select hold from holds where type='pee'),
           'poopHoldHours', (select hold from holds where type='poo'),
           'feedTimes',     (select to_jsonb(times) from feeds)) end;
$$;
```

---

## 3. Notification / prediction pipeline — end to end

### 3.1 Where predictions are computed: **server-side (Postgres)**, rendered client-side

The client keeps `lib/petSchedule.ts` for *instant optimistic UI* (Upcoming section renders offline from local data), but the **authoritative** prediction lives in `prediction_state`, maintained by the `app.recompute_prediction` trigger chain. Rationale: pushes must fire when *every* device is killed, and two household members' logs must feed one shared prediction. The client function and the SQL function implement the identical algorithm, so optimistic UI and server pushes agree.

### 3.2 Scheduler

`pg_cron` ticks every minute and invokes the dispatcher Edge Function via `pg_net` (service-role JWT stored in Vault):

```sql
select cron.schedule('dispatch-notifications', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
               || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object('Authorization',
               'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key'),
               'Content-Type','application/json'),
    body    := '{}'::jsonb);
$$);

select cron.schedule('check-push-receipts', '*/15 * * * *', $$ ... /functions/v1/check-receipts ... $$);
select cron.schedule('recalibrate-holds',   '30 3 * * *',   $$ ... /functions/v1/recalibrate ... $$);
```

(Minute-level granularity is plenty; the buffer window is ≥10 minutes.)

### 3.3 `dispatch-notifications` Edge Function (Deno)

One function, four due-item queries, single send path:

```ts
// supabase/functions/dispatch-notifications/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ACTION_SECRET = new TextEncoder().encode(Deno.env.get("ACTION_TOKEN_SECRET")!);

type DueItem = {
  kind: "break_prediction" | "meal" | "medication" | "appointment";
  dedupeKey: string;
  householdId: string; petId: string | null;
  title: string; body: string;
  categoryId?: "break-check" | "meal-check" | "med-check";
  data: Record<string, unknown>;
};

Deno.serve(async (req) => {
  assertServiceRole(req);                                   // 401 otherwise
  const due: DueItem[] = [
    ...(await dueBreakPredictions()),   // prediction_state: notify_at <= now,
                                        //   (snoozed_until is null or <= now), quiet-hours aware
    ...(await dueMeals()),              // feed_times joined to household tz:
                                        //   local_time within [now-1min, now] local; dedupe per local date
    ...(await dueMedications()),        // same shape as meals
    ...(await dueAppointmentReminders())// appointment_reminders.fire_at <= now and sent_at is null
  ];

  for (const item of due) {
    // IDEMPOTENCY GATE: unique dedupe_key. Concurrent/replayed cron ticks insert-or-skip.
    const { data: notif, error } = await admin.from("notifications")
      .insert({ household_id: item.householdId, pet_id: item.petId, kind: item.kind,
                dedupe_key: item.dedupeKey, title: item.title, body: item.body,
                data: item.data, scheduled_for: new Date().toISOString(),
                sent_at: new Date().toISOString(), status: "sent" })
      .select("id").single();
    if (error?.code === "23505") continue;                  // already sent by a previous tick

    const actionToken = await new SignJWT({
        nid: notif.id, pid: item.petId, hid: item.householdId,
        kind: item.kind, ...item.data })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("3h")
      .sign(ACTION_SECRET);

    const tokens = await memberPushTokens(item.householdId); // members -> notification_tokens (revoked_at is null)
    const messages = tokens.map(t => ({
      to: t.expo_push_token,
      title: item.title, body: item.body, sound: "default",
      categoryId: item.categoryId,                          // enables Yes/No/Snooze buttons
      channelId: item.kind,                                 // Android channels per kind
      data: { v: 1, notificationId: notif.id, actionToken, ...item.data },
    }));
    const tickets = await sendExpoPush(messages);           // POST https://exp.host/--/api/v2/push/send, chunks of 100
    await admin.from("notifications").update({ expo_tickets: tickets }).eq("id", notif.id);
    await postSendBookkeeping(item);                        // reminders.sent_at, prediction_state.last_notification_id,
                                                            // and roll notify_at forward one cycle so it can't re-fire
  }
  return Response.json({ dispatched: due.length });
});
```

Due-query details:

- **Breaks:** `select ... from prediction_state ps join pets p ... where ps.notify_at <= now() and (ps.snoozed_until is null or ps.snoozed_until <= now()) for update skip locked`. After sending, set `ps.notify_at = ps.predicted_at + make_interval(hours => ps.hold_hours)` — the next cycle — so an unanswered push doesn't re-fire every minute; a subsequent log recomputes properly via trigger.
- **Meals/meds:** resolve `local_time` through `households.timezone`: `(date_trunc('day', now() at time zone h.timezone) + ft.local_time) at time zone h.timezone between now() - interval '90 seconds' and now()`. Dedupe key embeds the household-local date: `meal:{feed_time_id}:{to_char(now() at time zone h.timezone,'YYYY-MM-DD')}` — DST-safe automatically.
- **Quiet hours:** skip `meal`/`break_prediction` when household-local time ∈ quiet window; med + appointment reminders still fire (health-critical), configurable later.

### 3.4 Payload schema and action categories

```ts
// shared/notificationContracts.ts (imported by app and edge functions)
export type BreakPushData = {
  v: 1;
  kind: "break_prediction";
  notificationId: string;
  actionToken: string;        // HS256 JWT: {nid, pid, hid, breakType, exp}
  petId: string;
  petName: string;
  breakType: "pee" | "poo";
  predictedAt: string;        // ISO
};
export const CATEGORY_BREAK = "break-check";
export type BreakAction = "LOG_YES" | "LOG_NO" | "SNOOZE_15";
```

Push copy: title `"💧 Mochi's pee break"`, body `"Predicted around 6:30 PM — did Mochi go?"`.

### 3.5 One-tap log write with the app possibly killed

- **Android:** action button press with `opensAppToForeground: false` starts the app in headless mode; register a background task via `Notifications.registerTaskAsync` (`expo-task-manager`) so the handler runs without UI.
- **iOS:** `UNNotificationAction` without foreground option wakes the app in the background; if iOS declines to wake a killed app, the response is queued and `Notifications.useLastNotificationResponse()` fires on next launch. **Therefore the write must be safe to happen seconds *or hours* later — which is why the action carries a self-contained `actionToken` and hits an idempotent endpoint rather than relying on client state or a live Supabase session.**

Client handler (single code path for foreground, background, and cold-launch replay):

```ts
// lib/push/actionHandler.ts
export async function handleNotificationResponse(resp: Notifications.NotificationResponse) {
  const data = resp.notification.request.content.data as BreakPushData;
  if (data?.v !== 1 || !data.actionToken) return;
  const action = resp.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ? "OPEN" : (resp.actionIdentifier as BreakAction);
  if (action === "OPEN") { router.push(`/?petId=${data.petId}`); return; }

  await postLogAction({                       // fetch with retry; falls back to outbox queue
    actionToken: data.actionToken,
    action,
    clientLogId: uuidv4(),                    // idempotency for OUR retries
    occurredAt: new Date().toISOString(),
  });
}
```

### 3.6 `log-action` Edge Function — the server-side write

```ts
// supabase/functions/log-action/index.ts
type LogActionRequest = {
  actionToken: string;                       // from push payload — auth even w/o session
  action: "LOG_YES" | "LOG_NO" | "SNOOZE_15";
  clientLogId: string;                       // uuid v4, client-generated
  occurredAt?: string;                       // defaults to now; user tapped == pet just went
};
type LogActionResponse = {
  ok: true;
  logId: string | null;                      // null for NO/SNOOZE
  nextPrediction: { breakType: "pee"|"poo"; predictedAt: string; notifyAt: string } | null;
  replayed: boolean;                         // true if this was an idempotent replay
};

Deno.serve(async (req) => {
  const body = (await req.json()) as LogActionRequest;
  const claims = await jwtVerify(body.actionToken, ACTION_SECRET);   // 401 on bad/expired
  const { nid, pid, hid, breakType } = claims.payload as any;

  // Attribute to a user when a session accompanies the call (foreground path)
  const actionBy = await tryResolveUser(req.headers.get("authorization"));

  // IDEMPOTENCY GATE 1: claim the notification action exactly once.
  const { data: claimed } = await admin.from("notifications")
    .update({ status: "actioned", action: body.action,
              action_at: new Date().toISOString(), action_by: actionBy })
    .eq("id", nid).eq("status", "sent")               // 'superseded'/'actioned' rows don't match
    .select("id").maybeSingle();
  if (!claimed) {                                     // partner already answered, or manual log superseded it
    return Response.json({ ok: true, logId: null, nextPrediction: await current(pid, breakType), replayed: true });
  }

  if (body.action === "SNOOZE_15") {
    await admin.from("prediction_state")
      .update({ snoozed_until: inMinutes(15), notify_at: inMinutes(15) })
      .eq("pet_id", pid).eq("break_type", breakType);
    // allow the snoozed re-ask: reset status so the next dispatch can re-claim
    await admin.from("notifications").update({ status: "sent", action: null }).eq("id", nid);
  } else if (body.action === "LOG_NO") {
    // "hasn't gone yet" — re-ask in 20 min AND record the drift signal
    await admin.rpc("app_record_break_no", { p_pet_id: pid, p_break_type: breakType }); // bumps consecutive_no_count, pushes notify_at +20min
  } else { // LOG_YES
    // IDEMPOTENCY GATE 2: client-generated PK; retries no-op.
    await admin.from("logs").insert({
      id: body.clientLogId, household_id: hid, pet_id: pid,
      type: breakType, occurred_at: body.occurredAt ?? new Date().toISOString(),
      note: "Logged from notification", source: "notification_yes",
      notification_id: nid, created_by: actionBy,
    }).then(r => { if (r.error && r.error.code !== "23505") throw r.error; });
    // trg_logs_after_insert has now: recomputed prediction_state AND superseded
    // any sibling in-flight break push for this pet/type. Realtime broadcasts the
    // new log row to every household member's open app. Nothing else to do.
  }
  return Response.json({ ok: true, logId: body.action === "LOG_YES" ? body.clientLogId : null,
                         nextPrediction: await current(pid, breakType), replayed: false });
});
```

**Re-prediction after each log** is therefore free: the same `trg_logs_after_insert` trigger serves manual taps in the app, one-tap notification actions, and the partner's device — one code path, always consistent.

**Two-owner race** ("both tap Yes"): Gate 1 (`status='sent'` compare-and-set) means the second tap becomes a benign replay; Gate 2 (PK insert) means network retries of the *same* tap are no-ops. A manual in-app log between send and tap flips the notification to `superseded` via the trigger, so the stale tap also no-ops. No duplicate logs are possible.

### 3.7 Token registration and rotation

```ts
// lib/push/registerToken.ts — call on app start (post-auth) and on auth change
export async function syncPushToken(supabase: SupabaseClient) {
  if (!Device.isDevice) return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const deviceId = await getOrCreateStableDeviceId();       // uuid in SecureStore
  await supabase.from("notification_tokens").upsert({
    user_id: (await supabase.auth.getUser()).data.user!.id,
    device_id: deviceId, expo_push_token: token,
    platform: Platform.OS, app_version: Constants.expoConfig?.version,
    last_seen_at: new Date().toISOString(), revoked_at: null,
  }, { onConflict: "user_id,device_id" });                  // rotation = same row, new token
}
```

Rotation/cleanup: the `check-receipts` cron fetches Expo receipts for stored `expo_tickets`; any `DeviceNotRegistered` sets `revoked_at` on the matching token row. Tokens with `last_seen_at > 90 days` are revoked nightly.

### 3.8 Timezone handling

- One `timezone` (IANA) per **household** — a shared dog lives in one physical timezone. Client seeds it from `Intl.DateTimeFormat().resolvedOptions().timeZone` at household creation.
- `feed_times.local_time` / `medications.local_time` are wall-clock `time` values; every scheduling comparison resolves through `at time zone h.timezone` **at dispatch time**, so DST is handled by Postgres's tz database, never by stored offsets.
- Absolute events (`logs.occurred_at`, `appointments.starts_at`, everything in `prediction_state`) are `timestamptz`.
- Dedupe keys for daily items embed the *household-local* date, preventing double-fires on the 25-hour fall-back day.

---

## 4. Sync architecture

### 4.1 Offline-first: local SQLite mirror + outbox (write-behind)

Pet logging happens on walks — offline is the *common* case:

- **Local store:** `expo-sqlite` database `pawclock.db` mirroring `pets`, `feed_times`, `medications`, `logs`, `appointments`, `appointment_pets`, `appointment_reminders`, plus `_outbox` and `_sync_state (table_name, last_pulled_at)`.
- **Reads:** every context/hook reads *only* SQLite. Server data flows into SQLite, never directly into React state.
- **Writes:** repository functions write SQLite first (optimistic, instant UI), then enqueue:

```ts
type OutboxEntry = {
  id: string;                       // uuid
  table: "pets" | "logs" | "appointments" | "feed_times" | "medications" | "appointment_pets" | "appointment_reminders";
  op: "upsert" | "soft_delete";
  rowId: string;                    // client-generated uuid v4 == server PK
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
};
```

- **Flush:** on app foreground, on `NetInfo` reconnect, and after each local write. Sequential per-table upserts (`.upsert(payload, { onConflict: "id" })`). Client-generated UUID PKs make every replay idempotent. Terminal errors (RLS denial, FK violation) dead-letter the entry and roll back the local row.
- **Pull (delta sync):** per table, `select * where household_id = ? and greatest(updated_at, created_at) > :last_pulled_at` (logs use `created_at`; soft-deleted rows arrive as tombstones and are removed locally). Cursor = max server timestamp seen. Run on foreground + after realtime reconnect.

### 4.2 Conflict resolution: **last-write-wins — CRDTs are the wrong tool here**

- **`logs` are append-only immutable facts** with client UUIDs — no conflicts by construction. Two owners logging the same physical pee within a minute is a *product* dedupe question (optionally warn "Alex logged pee 40s ago" via realtime before insert), not a data-consistency one.
- **`pets` / `feed_times` / `appointments`** are low-contention config. Row-level LWW on server `updated_at` (server clock via the `touch_updated_at` trigger — never trust device clocks) is sufficient. The loss window ("both partners edited Mochi's profile while both offline") is vanishingly rare and self-correcting.
- CRDTs would add a sync engine's worth of complexity to protect against a conflict class this app essentially doesn't have. Revisit only if collaborative free-text is added — and even then prefer field-level LWW first.

Concretely: pulls overwrite local rows whose server `updated_at` is newer; the outbox always pushes full-row upserts; the server trigger stamps the authoritative `updated_at`.

### 4.3 Realtime (two owners, one dog, live logs)

One channel per household using Postgres Changes (RLS-authorized):

```ts
// lib/sync/realtime.ts
export function subscribeHousehold(supabase: SupabaseClient, householdId: string) {
  const filter = `household_id=eq.${householdId}`;
  return supabase
    .channel(`household:${householdId}`, { config: { private: true } })
    .on("postgres_changes", { event: "*", schema: "public", table: "logs", filter },        upsertLocalFromServer)
    .on("postgres_changes", { event: "*", schema: "public", table: "pets", filter },        upsertLocalFromServer)
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter }, upsertLocalFromServer)
    .subscribe();
}
```

Flagship flow: Owner A taps "Yes" on the push → `log-action` inserts the log server-side → trigger recomputes `prediction_state` → Owner B's open app receives the `logs` INSERT over the channel → local SQLite upsert → Timeline and Upcoming re-render live. If B's app is closed, B gets the row on next pull; B also *doesn't* get a duplicate ask because the notification row was claimed. Events for `feed_times`/`medications`/`prediction_state` use the cheaper "pull on event" pattern.

Note: enable the tables in the `supabase_realtime` publication and set `alter table public.logs replica identity full;` so UPDATE/DELETE events carry enough data for local reconciliation.

---

## 5. Auth

### 5.1 Providers

- **Anonymous-first onboarding** (`supabase.auth.signInAnonymously()`): user opens PawClock and adds a pet with zero friction. First launch: anonymous sign-in → `create_household_with_membership(deviceLocaleName, deviceTimezone)` → proceed. Session persisted in `expo-secure-store` via supabase-js `storage` adapter.
- **Upgrade path (no data migration needed):** `linkIdentity` keeps the same `auth.uid`, so every household/pet/log row already belongs to the upgraded account:
  - Apple: `expo-apple-authentication` → `signInWithIdToken({ provider: 'apple', token: identityToken })`
  - Google: native ID token via `@react-native-google-signin/google-signin` → `signInWithIdToken({ provider: 'google', ... })`
  - Email: `supabase.auth.updateUser({ email })` + OTP verification.
  - Edge case: linking an identity that already has an account → "That Apple ID already has a PawClock account — sign in instead?" V1: offer sign-in + join-by-invite; don't attempt automatic merge.
- **Upgrade prompts gated on value moments:** creating an invite, or enabling push, requires a linked identity (prompt: "Add a login so you don't lose Mochi's history").

### 5.2 Household invite flow

1. Owner taps "Invite partner" → `create_invite` RPC → `{ code: 'K3M9QP', url }`.
2. Share sheet sends `https://pawclock.app/join/K3M9QP` (universal link → app; falls back to store page). `expo-linking` route `app/join/[code].tsx`.
3. Recipient signs in (anonymous is fine) → `redeem_invite('K3M9QP')` RPC (atomic use-count check, membership insert) → client refetches memberships, switches active household, resubscribes realtime, full pull.
4. V1 keeps **one household per user** in the UI (schema supports many).
- Abuse controls: 6-char code from a 32^6 space, 7-day expiry, `max_uses 5`, redemption rate-limited, owner can revoke.

---

## 6. API surface (everything the frontend calls)

Split: **PostgREST via supabase-js** for household-scoped CRUD (RLS does authz), **RPCs** for atomic multi-row ops, **Edge Functions** for anything touching push or service-role. Shared types generated by `supabase gen types typescript --local > lib/db/types.gen.ts`.

### 6.1 Domain types (client models, replacing `data/mockData.ts` types)

```ts
// lib/db/models.ts
export type Pet = {
  id: string; householdId: string;
  name: string; avatarEmoji: string;
  species: "dog"|"cat"|"rabbit"|"hamster"|"bird"|"turtle"|"snake"|"fish"|"other";
  breed: string | null;
  birthdate: string | null;              // ISO date; age rendered via formatAge(birthdate)
  weightKg: number | null;
  peeHoldHours: number | null; poopHoldHours: number | null;
  calibrationStartedAt: string;
  archivedAt: string | null; createdAt: string; updatedAt: string;
};
export type FeedTime   = { id: string; petId: string; localTime: string /*"HH:MM"*/; label: string | null; active: boolean };
export type Medication = { id: string; petId: string; name: string; dosage: string | null; localTime: string; active: boolean };
export type LogEntry = {
  id: string; householdId: string; petId: string;
  type: "pee"|"poo"|"food"|"medication"|"vet"|"other";
  occurredAt: string; note: string | null;
  source: "manual"|"notification_yes"|"backfill"|"import"|"system";
  createdBy: string | null; deletedAt: string | null;
};
export type Appointment = {
  id: string; householdId: string;
  type: "vet"|"groom"|"vaccine"|"other";
  title: string; startsAt: string; allDay: boolean;
  location: string | null; notes: string | null; completedAt: string | null;
  petIds: string[];                       // from appointment_pets
  reminderOffsetsMinutes: number[];       // from appointment_reminders
};
export type PredictionState = {
  petId: string; breakType: "pee"|"poo";
  predictedAt: string | null; bufferMinutes: number | null;
  notifyAt: string | null; snoozedUntil: string | null;
};
```

### 6.2 Repository operations (supabase-js, all RLS-guarded)

```ts
// lib/db/repo.ts — the layer contexts delegate to (each also writes SQLite + outbox)
listPets(): Promise<Pet[]>
createPet(input: PetUpsert): Promise<Pet>                      // upsert w/ client uuid
updatePet(id: string, patch: Partial<PetUpsert>): Promise<Pet>
archivePet(id: string): Promise<void>                          // update archived_at (replaces hard delete)
replaceFeedTimes(petId: string, times: string[]): Promise<FeedTime[]>   // rpc('replace_feed_times') — atomic diff
replaceMedications(petId: string, meds: MedicationUpsert[]): Promise<Medication[]>

listLogs(petId: string, opts?: { since?: string; limit?: number }): Promise<LogEntry[]>
addLog(input: { id: string; petId: string; householdId: string;
                type: LogEntry["type"]; occurredAt?: string; note?: string }): Promise<LogEntry>
undoLog(id: string): Promise<void>                             // update deleted_at (10-min undo window in UI)

listAppointments(): Promise<Appointment[]>
createAppointment(input: {
  id: string; type: Appointment["type"]; title: string;
  startsAt: string; allDay: boolean; location?: string; notes?: string;
  petIds: string[]; reminderOffsetsMinutes: number[];          // [10080,1440,120] from the toggles
}): Promise<Appointment>                                       // rpc('create_appointment') — atomic 3-table write
updateAppointment(id: string, patch: ...): Promise<Appointment>
deleteAppointment(id: string): Promise<void>                   // soft delete

getPredictions(petIds: string[]): Promise<PredictionState[]>
getInferredSchedule(petId: string): Promise<InferredSchedule | null>  // rpc('infer_schedule')
applyInferredSchedule(petId: string, s: InferredSchedule): Promise<void>

// household / auth
createHousehold(name: string, timezone: string): Promise<string>   // rpc('create_household_with_membership')
getMyHousehold(): Promise<{ household: Household; members: MemberProfile[] }>
updateHousehold(patch: { name?: string; timezone?: string; quietHoursStart?: string|null; quietHoursEnd?: string|null }): Promise<void>
createInvite(): Promise<{ code: string; url: string }>
redeemInvite(code: string): Promise<string>                    // rpc('redeem_invite') -> householdId
leaveHousehold(): Promise<void>

registerPushToken(): Promise<void>
```

### 6.3 Edge Function endpoints

| Endpoint | Auth | Caller | Request → Response |
|---|---|---|---|
| `POST /functions/v1/dispatch-notifications` | service role only | pg_cron | `{}` → `{ dispatched: number }` |
| `POST /functions/v1/log-action` | **actionToken JWT** (+ optional user JWT for attribution) | push action handler | `LogActionRequest` → `LogActionResponse` |
| `POST /functions/v1/check-receipts` | service role only | pg_cron 15-min | `{}` → `{ checked, revoked }` |
| `POST /functions/v1/recalibrate` | service role only | pg_cron nightly | `{}` → `{ petsUpdated }` — EWMA of observed intervals (14-day window), blended 30/70 with current hold; auto-applies for calibrating pets after day 3 (server-side AutoCalibrator), suggests via `digest` row for already-configured pets; `consecutive_no_count ≥ 3` nudges hold +0.5 h |
| `POST /functions/v1/delete-account` | user JWT | settings screen | `{}` → `{ ok }` — deletes `auth.users` row; cascades wipe everything |

### 6.4 Context refactor contract

`PetsContext` / `LogsContext` / `AppointmentsContext` keep their exact public shapes (`usePets()`, `addLog(petId, …)`, etc.) so **no screen files change** in the first migration phase — their internals swap `useState(seed)` for `repo + SQLite + realtime`. `LogsContext.addLog` drops `icon/label/sub` params (presentation moves to `Timeline`'s render, keyed off `type`).

---

## 7. Security & privacy

- **RLS as the primary wall:** every domain table household-scoped through `app.is_member()`; membership mutations only via SECURITY DEFINER RPCs; `notifications`/`prediction_state` member-readable, service-role-writable. Verify with pgTAP tests per policy.
- **Action tokens:** HS256, dedicated secret (not the Supabase JWT secret), 3 h expiry, claims pin `notification_id + pet_id + household_id + break_type`; single-use enforced by the `status='sent'` compare-and-set — a leaked token can at most log one pee for one dog once, within 3 hours. No PII in push payloads beyond pet name.
- **Rate limiting:** Edge Functions check a Postgres token bucket (`app.rate_limits`): `log-action` 30/min per token subject; `redeem_invite` 5/hour per user and per IP; `create_invite` 10/day per household. Sanity alarm on `logs` rows/household/day > 500.
- **PII inventory:** email + OAuth identity (auth schema), display name, Expo push tokens (treat as PII, revoke on logout), household timezone (coarse location), appointment `location` free text, pet medications (sensitive-adjacent). No precise geolocation, no photos in v1. Account deletion = hard cascade; export via `get_my_data` RPC (GDPR/CCPA hygiene).
- **Client secrets:** only the anon key ships in the app (safe with RLS); service-role key + `ACTION_TOKEN_SECRET` live exclusively in Edge Function env + Vault.
- **Transport/session:** TLS; session in SecureStore (not AsyncStorage); `detectSessionInUrl: false`, PKCE flow for OAuth deep links.

---

## 8. Migration plan and local-dev story

### Local dev

```bash
npm i -g supabase        # or brew install supabase/tap/supabase
supabase init            # creates supabase/ in the repo
supabase start           # Docker: Postgres+Auth+Realtime+Storage+Edge runtime+Studio
supabase migration new core_schema
supabase db reset        # applies migrations + supabase/seed.sql
supabase functions serve dispatch-notifications --env-file supabase/.env.local
supabase gen types typescript --local > lib/db/types.gen.ts
```

- `supabase/seed.sql` recreates today's demo world (Mochi calibrating with 6 PM supplement, Luna 4 h/6 h, Peanut needs-info, three appointments with real `starts_at`) so every dev reset looks like the current mock app.
- App reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` (LAN IP for device testing).
- **Push caveat:** Expo push requires a dev build — remote notifications don't work in Expo Go SDK 53+. Local pipeline test: trigger `dispatch-notifications` with `curl`, assert `notifications` rows; real-device push testing against hosted staging.
- Cron locally: pg_cron runs inside `supabase start`'s Postgres; point `net.http_post` at the locally served function.

### Phased cutover (each phase ships a working app)

- **Phase A — Foundations (no visible change):** `supabase/` repo layout, migrations §2, seed parity, generated types, supabase-js client with SecureStore session. Mock contexts untouched.
- **Phase B — Auth + persistence:** anonymous sign-in, household bootstrap, contexts rewired to `repo` (online-only reads first), seeds replaced by onboarding. Fix modeling flaws at the UI edge: age → birthdate picker; `add-appointment` builds `startsAt` ISO + `petIds` + `reminderOffsetsMinutes`; countdown computed at render.
- **Phase C — Offline + realtime:** SQLite mirror, outbox, delta pull, household channel. Kill-app/offline-log/airplane-mode test matrix.
- **Phase D — Flagship push loop:** token registration, categories, `dispatch-notifications`, `log-action`, background/cold-launch action handling, receipts cron. Meal + med + appointment reminders ride the same dispatcher.
- **Phase E — Calibration + sharing:** `infer_schedule`/`recalibrate` server-side, invite flow, account linking, account deletion + export.
- **Phase F — Proactive extras**, App Store hardening, staging→prod CI (`supabase db push` + `functions deploy` in GitHub Actions).

Rollback safety: contexts keep their interfaces, so any phase can ship behind a `EXPO_PUBLIC_BACKEND=off` flag falling back to the local path.

---

## 9. Proactive-spirit feature proposals (with backend requirements)

1. **"Not yet" adaptive re-ask + hold-drift learning** *(ship with Phase D)* — LOG_NO re-asks in 20 min; `consecutive_no_count ≥ 3` lets `recalibrate` stretch the hold by 0.5 h. Already in schema.
2. **Partner-aware med escalation** — med push unanswered 30 min → escalate to the *other* household member. Dispatcher pass over `notifications` where `kind='medication' and status='sent' and sent_at < now()-30min`; `med_escalation` kind, dedupe per med per day.
3. **Vaccine auto-recurrence** — completing a `vaccine` appointment offers "book next in 12 months"; overdue vaccines generate weekly nudges. `appointments.recurrence_months int`, nightly cron clones completed recurring appts.
4. **Weekly household digest** — Sunday push + in-app card: potty regularity trend, meal adherence %, streaks. Nightly rollup `daily_pet_stats(pet_id, local_date, pee_count, poo_count, meals_logged, meds_given, avg_pee_interval_h)`; `digest` kind.
5. **Anomaly flags (soft health signal)** — pee frequency > 2× 14-day baseline over 48 h → gentle "consider a vet check" card (in-app only, never a scary push; explicit not-a-diagnosis copy). Reads `daily_pet_stats`, writes `insights(pet_id, kind, window, dismissed_at)`.
6. **Photo notes on logs** — Storage bucket `log-photos` with household-path RLS (`(storage.foldername(name))[1] = household_id`), `logs.photo_path text`, client resize before upload.
7. **Pet-sitter mode** — time-boxed invite (`member_expires_at` on membership; enforcement is one clause in `app.is_member`). Sitter sees schedules + can log, can't edit pets/appointments.
8. **Live "time since last pee" widget/Live Activity** *(later)* — iOS Live Activity updated via push; needs ActivityKit token storage and a dispatcher branch; defer past v1.

---

## 10. Milestones & effort

Numbered `BE-#` to match the track naming in `PLAN.md` §4 — every one of
these ships with **zero frontend dependency**; the RN app never needs to
exist for this track to be built or verified. Original per-milestone
estimates (M0–M6) are grouped into the five BE-# phases `PLAN.md` tracks
against the FE-# timeline.

| # | Milestone | Contents | Days | Needs FE? | Verified by |
|---|---|---|---|---|---|
| **BE-1** | Foundations (was M0+M1) | Supabase project + local Docker stack, migrations (schema, triggers, RLS, RPCs), seed parity, generated types, pgTAP RLS tests · anonymous auth, household bootstrap, form-field-driving column fixes (birthdate, startsAt, petIds, reminder offsets) | 7 | No | `supabase db reset` + pgTAP |
| **BE-2** | Offline-first + realtime (was M2) | SQLite-side contract: realtime publication config, replica identity, delta-pull cursor design, tombstones, household channel, reconnect semantics | 5 | No | `psql` + manual channel subscribe via `curl`/Studio |
| **BE-3** 🚩 | Flagship push loop (was M3) | Token registration/rotation, categories, `dispatch-notifications` (breaks+meals+meds+appts), `log-action` with dual idempotency gates, background/cold-launch handling, receipts cron, quiet hours | 6 | No | `curl` against Edge Functions + Expo push tool with a manually-registered test token |
| **BE-4** | Calibration + household sharing (was M4+M5) | `infer_schedule` + nightly `recalibrate`, invite create/redeem + deep link, Apple/Google linking, account deletion/export · LOG_NO drift, med escalation, vaccine recurrence, weekly digest + rollup table | 7 | No | pgTAP + RPC calls via `psql`/Studio |
| **BE-5** | Hardening + launch (was M6) | Rate limiting, load sanity, Sentry, staging/prod CI, EAS builds, store review prep (push permission priming) | 3 | No | CI pipeline dry-run + staging smoke test |
| | **Total** | | **≈ 28 days** | | |

**BE-1 → BE-5 subtotal: 28 focused days**, fully independent of the frontend
track. Critical path to the flagship push loop being live (BE-1 → BE-3) ≈
18 days, with BE-2 insertable before or after BE-3.

### Where this track meets the frontend (see `PLAN.md` §4 for full detail)

| Sync | Trigger | BE-side prerequisite | Timed |
|---|---|---|---|
| **SYNC 1** | This track ships BE-1 | Schema + anonymous auth live on the local/staging project | ~day 7 |
| **SYNC 2** | This track ships BE-3 | Dispatcher + `log-action` live, reachable by a real dev-build phone | ~day 18 |
| **SYNC 3** | This track ships BE-4 | Invite RPCs live | ~day 25 |
| **SYNC 4** | Both tracks substantially done | Staging project stable enough for two physical devices | Final week |

---

### Key file-by-file touchpoints for the migration

- `data/mockData.ts` → deleted; types move to `lib/db/models.ts`; demo world moves to `supabase/seed.sql`.
- `context/*.tsx` → same public APIs, internals delegate to `lib/db/repo.ts` + SQLite + realtime.
- `lib/petSchedule.ts` → stays as the optimistic client mirror; `getUpcomingForPet` gains an optional `predictionState` param to prefer server predictions when fresh.
- `lib/appointmentUtils.ts` → `parseAppointmentDateTime` deleted; `computeCountdown` becomes the sole countdown source, called at render.
- `app/add-pet.tsx` → age → birthdate picker; feed times / meds write through `replaceFeedTimes` / `replaceMedications`.
- `app/add-appointment.tsx` → toggles map to `reminderOffsetsMinutes: [10080, 1440, 120]`; "recurring" maps to `recurrence_months` (Phase F) or is hidden until then.
- New: `app/_layout.tsx` gains `SessionProvider` + notification response listener + `useLastNotificationResponse` replay; new `app/join/[code].tsx`, `app/settings/household.tsx`.
