-- 0003_core.sql
-- Core domain tables. Every domain row is household-scoped; RLS (0006) enforces that
-- through app.is_member(). Presentation (icons, labels, formatted times, "2 yrs", "In 2
-- days") is deliberately absent — the client derives all of it from these values.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- Mirrors auth.users 1:1; created by trigger on signup (incl. anonymous users).
create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_emoji  text not null default '🙂',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Households
-- ---------------------------------------------------------------------------

create table public.households (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default 'My Household',
  -- IANA tz. A shared dog lives in one physical place, so the timezone belongs to the
  -- household, not the user. All wall-clock scheduling resolves through this at dispatch
  -- time, so DST is Postgres's problem, never a stored offset's.
  timezone          text not null default 'America/Los_Angeles',
  quiet_hours_start time,      -- e.g. 22:00 — suppresses non-critical pushes
  quiet_hours_end   time,      -- e.g. 07:00
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Δ5: the plan validated the timezone with
--   check ((now() at time zone timezone) is not null)
-- which embeds a volatile function in a CHECK and "works" only by raising rather than
-- returning false. Same guarantee, deliberate error, no volatility in a constraint:
create or replace function app.validate_household_timezone() returns trigger
language plpgsql as $$
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    raise exception 'INVALID_TIMEZONE: %', new.timezone using errcode = 'P0001';
  end;
  return new;
end $$;

create trigger trg_households_validate_tz
  before insert or update of timezone on public.households
  for each row execute function app.validate_household_timezone();

create table public.household_members (
  household_id      uuid not null references public.households(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role              public.member_role not null default 'member',
  -- Non-null only for time-boxed roles (dog walker / sitter). app.is_member() treats an
  -- elapsed expiry as "not a member" (BACKEND_PLAN §9.7).
  member_expires_at timestamptz,
  joined_at         timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index idx_members_user on public.household_members(user_id);

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- 6 chars from a 32^6 space; redemption is rate-limited and use-capped (0007/0008).
  code         text not null unique
               default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  role         public.member_role not null default 'member',
  created_by   uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '7 days',
  max_uses     int not null default 5 check (max_uses > 0),
  use_count    int not null default 0,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_invites_household on public.household_invites(household_id);

-- ---------------------------------------------------------------------------
-- Pets and their schedules
-- ---------------------------------------------------------------------------

create table public.pets (
  id                     uuid primary key default gen_random_uuid(),  -- client-generated OK
  household_id           uuid not null references public.households(id) on delete cascade,
  name                   text not null check (length(name) between 1 and 60),
  avatar_emoji           text not null default '🐶',
  species                public.species not null default 'other',
  breed                  text,
  -- Δ6: replaces the static '2 yrs' display string. Nullable — the FE birthdate picker
  -- ships after SYNC-1, and nothing blocks on it. Age is rendered client-side.
  birthdate              date check (birthdate is null or birthdate <= current_date),
  weight_kg              numeric(5,2) check (weight_kg is null or weight_kg > 0),
  -- Mirror lib/petSchedule.ts clamps; null = not yet calibrated (the 'needsInfo' state).
  pee_hold_hours         numeric(4,1) check (pee_hold_hours  is null or pee_hold_hours  between 0.5 and 24),
  poop_hold_hours        numeric(4,1) check (poop_hold_hours is null or poop_hold_hours between 0.5 and 24),
  -- Drives the 3-day calibration countdown (was Pet.createdAt client-side).
  calibration_started_at timestamptz not null default now(),
  archived_at            timestamptz,   -- soft delete: log history survives the pet
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references auth.users(id) on delete set null
);
create index idx_pets_household on public.pets(household_id) where archived_at is null;

-- Was Pet.feedTimes: string[] of '7:30 AM'. Now a real `time` resolved through the
-- household timezone at dispatch. Each row is also a meal *slot* that a food log can
-- reference (see logs.feed_time_id, Δ1).
create table public.feed_times (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  local_time time not null,
  label      text,           -- optional user override; else derived by nameMeal()-equivalent
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pet_id, local_time)
);
create index idx_feed_times_pet on public.feed_times(pet_id) where active;

create table public.medications (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  name       text not null check (length(name) between 1 and 120),
  dosage     text,
  local_time time not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_meds_pet on public.medications(pet_id) where active;

-- ---------------------------------------------------------------------------
-- Logs — append-only event stream, the spine of the whole app
-- ---------------------------------------------------------------------------

create table public.logs (
  -- CLIENT-generated uuid v4. This is idempotency gate 2: a network retry of the same
  -- tap re-inserts the same PK and no-ops instead of double-logging.
  id              uuid primary key,
  household_id    uuid not null references public.households(id) on delete cascade,
  pet_id          uuid not null references public.pets(id) on delete cascade,
  type            public.log_type not null,
  occurred_at     timestamptz not null default now(),
  note            text check (note is null or length(note) <= 280),
  source          public.log_source not null default 'manual',
  notification_id uuid,   -- set when written via a push action (FK added in 0004)
  -- Δ1: meal-slot identity. getTodaysMeals() (petSchedule.ts:256) matches food logs to
  -- slots by *label name* so "Dinner" flips the Dinner row even when logged out of order.
  -- Dropping presentation would have silently regressed that, so slot identity becomes a
  -- relation instead: a food log points at the feed_time it covers. Meal push dedupe keys
  -- already key on feed_time_id, so a LOG_YES on a meal push fills this in for free.
  feed_time_id    uuid references public.feed_times(id) on delete set null,
  medication_id   uuid references public.medications(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- Soft delete = the 10-minute undo window AND the sync tombstone.
  deleted_at      timestamptz,

  constraint logs_feed_time_only_on_food
    check (feed_time_id is null or type = 'food'),
  constraint logs_medication_only_on_medication
    check (medication_id is null or type = 'medication')
);

-- Prediction anchor lookup: "last pee for this pet".
create index idx_logs_pet_type_time on public.logs(pet_id, type, occurred_at desc)
  where deleted_at is null;
create index idx_logs_household_time on public.logs(household_id, occurred_at desc);
-- Delta-pull cursor (BE-2): logs are append-only so created_at is the cursor.
create index idx_logs_sync on public.logs(household_id, created_at);
create index idx_logs_feed_time on public.logs(feed_time_id) where feed_time_id is not null;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

create table public.appointments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type         public.appt_type not null default 'vet',
  title        text not null check (length(title) between 1 and 200),
  -- Real timestamp; no stored countdown. The client's computeCountdown() renders it live.
  starts_at    timestamptz not null,
  -- Δ2: the client models this as `hasTime`. Repo seam maps all_day = not hasTime.
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

-- Already matches the client's Appointment.petIds — this is just its relational form.
create table public.appointment_pets (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  pet_id         uuid not null references public.pets(id) on delete cascade,
  primary key (appointment_id, pet_id)
);
create index idx_appt_pets_pet on public.appointment_pets(pet_id);

-- Matches the client's Appointment.reminderOffsets (minutes before starts_at).
-- fire_at is maintained by trigger so a reschedule re-arms every reminder (0005).
create table public.appointment_reminders (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  offset_minutes int not null check (offset_minutes >= 0),   -- 10080 / 1440 / 120 / 0
  fire_at        timestamptz not null,
  sent_at        timestamptz,
  unique (appointment_id, offset_minutes)
);
create index idx_appt_reminders_due on public.appointment_reminders(fire_at)
  where sent_at is null;
