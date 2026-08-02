-- 0007_rpcs.sql
-- SECURITY DEFINER RPCs: atomic multi-row operations, plus the only two paths that are
-- allowed to create membership.
--
-- Every function here bypasses RLS by design, so every one must check authorization
-- explicitly. `set search_path = public` on each prevents search-path hijacking.

-- ---------------------------------------------------------------------------
-- Household bootstrap — the first thing a new (anonymous) user does
-- ---------------------------------------------------------------------------

create or replace function public.create_household_with_membership(
  p_name     text default 'My Household',
  p_timezone text default 'America/Los_Angeles'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  insert into public.households (name, timezone, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'My Household'), p_timezone, auth.uid())
  returning id into v_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create or replace function public.create_invite(
  p_role       public.member_role default 'member',
  p_expires_in interval default interval '7 days',
  p_max_uses   int default 5
) returns public.household_invites
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_invite    public.household_invites;
begin
  select m.household_id into v_household
    from public.household_members m
   where m.user_id = auth.uid() and m.role in ('owner','member')
   limit 1;

  if v_household is null then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  -- A walker invite may only be issued by an owner: it grants log-write access.
  if p_role = 'walker' and not app.is_owner(v_household) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0001';
  end if;

  perform app.check_rate_limit('create_invite:' || v_household::text, 10, interval '1 day');

  insert into public.household_invites (household_id, role, created_by, expires_at, max_uses)
  values (v_household, p_role, auth.uid(), now() + p_expires_in, p_max_uses)
  returning * into v_invite;

  return v_invite;
end $$;

-- Redemption must be SECURITY DEFINER: the recipient is not a member yet, so RLS would
-- hide the invite row from them entirely.
create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_role      public.member_role;
  v_expires   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  perform app.check_rate_limit('redeem_invite:' || auth.uid()::text, 5, interval '1 hour');

  -- Atomic claim: the use_count check and increment happen in one statement, so two
  -- simultaneous redemptions of the last remaining use cannot both succeed.
  update public.household_invites i
     set use_count = i.use_count + 1
   where i.code = upper(trim(p_code))
     and i.revoked_at is null
     and i.expires_at > now()
     and i.use_count < i.max_uses
  returning i.household_id, i.role into v_household, v_role;

  if v_household is null then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;

  -- Walker access is time-boxed; co-owner access is not.
  v_expires := case when v_role = 'walker' then now() + interval '24 hours' else null end;

  insert into public.household_members (household_id, user_id, role, member_expires_at)
  values (v_household, auth.uid(), v_role, v_expires)
  on conflict (household_id, user_id) do nothing;

  return v_household;
end $$;

-- ---------------------------------------------------------------------------
-- Schedule config — atomic replace so the client can send the whole list
-- ---------------------------------------------------------------------------

create or replace function public.replace_feed_times(p_pet_id uuid, p_times time[])
returns setof public.feed_times
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_editor(app.pet_household(p_pet_id)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Soft-retire rather than delete: existing food logs reference feed_time_id (Δ1), and
  -- deleting the row would null those references and lose meal-slot history.
  update public.feed_times
     set active = false
   where pet_id = p_pet_id
     and local_time <> all (coalesce(p_times, '{}'::time[]));

  insert into public.feed_times (pet_id, local_time, active)
  select p_pet_id, t, true from unnest(coalesce(p_times, '{}'::time[])) as t
  on conflict (pet_id, local_time) do update set active = true;

  return query
    select * from public.feed_times
     where pet_id = p_pet_id and active
     order by local_time;
end $$;

create or replace function public.replace_medications(p_pet_id uuid, p_meds jsonb)
returns setof public.medications
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_editor(app.pet_household(p_pet_id)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- p_meds: [{ "id": uuid|null, "name": text, "dosage": text|null, "localTime": "HH:MM" }]
  update public.medications
     set active = false
   where pet_id = p_pet_id
     and id <> all (
       select coalesce((m->>'id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
         from jsonb_array_elements(coalesce(p_meds, '[]'::jsonb)) m
     );

  insert into public.medications (id, pet_id, name, dosage, local_time, active)
  select coalesce((m->>'id')::uuid, gen_random_uuid()),
         p_pet_id,
         m->>'name',
         nullif(m->>'dosage', ''),
         (m->>'localTime')::time,
         true
    from jsonb_array_elements(coalesce(p_meds, '[]'::jsonb)) m
  on conflict (id) do update
     set name       = excluded.name,
         dosage     = excluded.dosage,
         local_time = excluded.local_time,
         active     = true;

  return query
    select * from public.medications
     where pet_id = p_pet_id and active
     order by local_time;
end $$;

-- ---------------------------------------------------------------------------
-- Appointments — one atomic write across three tables
-- ---------------------------------------------------------------------------
-- The client's add-appointment.tsx produces title + startsAt + petIds + reminderOffsets
-- in a single submit; splitting that into three round-trips would let a crash leave an
-- appointment with no pets attached.

create or replace function public.create_appointment(
  p_id                uuid,
  p_household_id      uuid,
  p_type              public.appt_type,
  p_title             text,
  p_starts_at         timestamptz,
  p_all_day           boolean default false,
  p_location          text default null,
  p_notes             text default null,
  p_pet_ids           uuid[] default '{}',
  p_reminder_offsets  int[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_editor(p_household_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Every pet must belong to this household — blocks attaching someone else's pet.
  if exists (
    select 1 from unnest(coalesce(p_pet_ids, '{}'::uuid[])) pid
     where not exists (
       select 1 from public.pets p where p.id = pid and p.household_id = p_household_id
     )
  ) then
    raise exception 'PET_NOT_IN_HOUSEHOLD' using errcode = 'P0001';
  end if;

  insert into public.appointments
        (id, household_id, type, title, starts_at, all_day, location, notes)
  values (p_id, p_household_id, p_type, p_title, p_starts_at, p_all_day,
          nullif(p_location, ''), nullif(p_notes, ''))
  on conflict (id) do update
     set type      = excluded.type,
         title     = excluded.title,
         starts_at = excluded.starts_at,
         all_day   = excluded.all_day,
         location  = excluded.location,
         notes     = excluded.notes;

  delete from public.appointment_pets
   where appointment_id = p_id
     and pet_id <> all (coalesce(p_pet_ids, '{}'::uuid[]));

  insert into public.appointment_pets (appointment_id, pet_id)
  select p_id, pid from unnest(coalesce(p_pet_ids, '{}'::uuid[])) pid
  on conflict do nothing;

  delete from public.appointment_reminders
   where appointment_id = p_id
     and offset_minutes <> all (coalesce(p_reminder_offsets, '{}'::int[]));

  insert into public.appointment_reminders (appointment_id, offset_minutes, fire_at)
  select p_id, off, p_starts_at - make_interval(mins => off)
    from unnest(coalesce(p_reminder_offsets, '{}'::int[])) off
  on conflict (appointment_id, offset_minutes) do update
     set fire_at = excluded.fire_at;

  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- LOG_NO — "hasn't gone yet". Called by the log-action Edge Function.
-- ---------------------------------------------------------------------------
-- Re-asks in 20 minutes and records the drift signal. Three consecutive "not yet"s let
-- the nightly recalibrate stretch the hold time (BACKEND_PLAN §9.1).

create or replace function public.record_break_no(
  p_pet_id     uuid,
  p_break_type public.break_type
) returns public.prediction_state
language plpgsql security definer set search_path = public as $$
declare v_row public.prediction_state;
begin
  update public.prediction_state
     set consecutive_no_count = consecutive_no_count + 1,
         notify_at            = now() + interval '20 minutes',
         updated_at           = now()
   where pet_id = p_pet_id and break_type = p_break_type
  returning * into v_row;

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- infer_schedule — server-side port of inferScheduleFromLogs()
-- ---------------------------------------------------------------------------
--
-- Client (lib/petSchedule.ts:401) requires >=2 pee logs, >=2 poo logs and >=1 food log,
-- then:
--   holds     : mean of consecutive gaps where 0 < gap <= 12h, rounded to nearest 0.5h,
--               floored at 1h   [averageIntervalHours]
--   feedTimes : food logs from the last 7 days bucketed by time-of-day (within ~1h),
--               each bucket contributing its lower median; buckets seen on >=2 distinct
--               days preferred, else all buckets   [inferFeedTimes]
--
-- Δ8 — two deliberate divergences from the client:
--   1. Bucketing is gap-based (new bucket when the time-of-day gap to the previous log
--      exceeds 60 min) rather than the client's running-average comparison. The client's
--      form is order-dependent and not expressible as a window function; results agree on
--      every realistic feed pattern and this is only ever a *suggestion* to the user.
--   2. Hold gaps use a 14-day window (the client uses all history). Bounded work per
--      call, and stale months-old intervals should not anchor a "current" schedule.
-- Neither can be exact anyway: the server infers from ALL caregivers' logs, which is the
-- whole point of moving inference server-side, and no single client sees that set.

create or replace function public.infer_schedule(p_pet_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_tz        text;
  v_pee       numeric;
  v_poo       numeric;
  v_feed      text[];
  v_food_n    int;
begin
  if not app.is_member(app.pet_household(p_pet_id)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select h.timezone into v_tz
    from public.pets p join public.households h on h.id = p.household_id
   where p.id = p_pet_id;

  -- Hold hours per break type, from consecutive-gap means.
  with gaps as (
    select l.type,
           extract(epoch from l.occurred_at
                   - lag(l.occurred_at) over (partition by l.type order by l.occurred_at)
                  ) / 3600.0 as h
      from public.logs l
     where l.pet_id = p_pet_id
       and l.type in ('pee','poo')
       and l.deleted_at is null
       and l.occurred_at > now() - interval '14 days'
  ),
  holds as (
    select type, greatest(1, round(avg(h) * 2) / 2.0) as hold
      from gaps
     where h > 0 and h <= 12
     group by type
  )
  select (select hold from holds where type = 'pee'),
         (select hold from holds where type = 'poo')
    into v_pee, v_poo;

  -- Feed times, bucketed by time-of-day.
  with food as (
    select l.occurred_at,
           (extract(hour   from l.occurred_at at time zone v_tz) * 60
          + extract(minute from l.occurred_at at time zone v_tz))::int as mod,
           (l.occurred_at at time zone v_tz)::date as local_date
      from public.logs l
     where l.pet_id = p_pet_id
       and l.type = 'food'
       and l.deleted_at is null
  ),
  recent as (
    select * from food
     where occurred_at >= (select max(occurred_at) from food) - interval '7 days'
  ),
  marked as (
    select *,
           case when mod - lag(mod) over (order by mod) > 60 then 1 else 0 end as is_new
      from recent
  ),
  bucketed as (
    select *, sum(is_new) over (order by mod rows unbounded preceding) as bucket
      from marked
  ),
  summary as (
    select bucket,
           count(distinct local_date) as days_seen,
           percentile_disc(0.5) within group (order by mod) as median_mod
      from bucketed
     group by bucket
  ),
  chosen as (
    select * from summary
     where days_seen >= 2
        -- Bootstrap: with no bucket yet seen on 2+ days (e.g. a single day of logs),
        -- fall back to every bucket so inference can still get started.
        or not exists (select 1 from summary where days_seen >= 2)
  )
  select array_agg(
           to_char((median_mod / 60)::int, 'FM00') || ':' ||
           to_char((median_mod % 60)::int, 'FM00')
           order by median_mod)
    into v_feed
    from chosen;

  select count(*) into v_food_n
    from public.logs
   where pet_id = p_pet_id and type = 'food' and deleted_at is null;

  -- Same confidence gate as the client: all three pieces or nothing.
  if v_pee is null or v_poo is null or v_feed is null
     or array_length(v_feed, 1) is null or v_food_n < 1 then
    return null;
  end if;

  return jsonb_build_object(
    'peeHoldHours',  v_pee,
    'poopHoldHours', v_poo,
    'feedTimes',     to_jsonb(v_feed)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Data export (GDPR/CCPA hygiene)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_data()
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare v_out jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'exportedAt', now(),
    'profile',    (select to_jsonb(p) from public.profiles p where p.user_id = auth.uid()),
    'households', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
                     from public.households h where app.is_member(h.id)),
    'pets',       (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                     from public.pets p where app.is_member(p.household_id)),
    'logs',       (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                     from public.logs l where app.is_member(l.household_id)),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                     from public.appointments a where app.is_member(a.household_id))
  ) into v_out;

  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Grants — RPCs are callable by signed-in users (incl. anonymous), never by anon-public
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_household_with_membership(text, text),
  public.create_invite(public.member_role, interval, int),
  public.redeem_invite(text),
  public.replace_feed_times(uuid, time[]),
  public.replace_medications(uuid, jsonb),
  public.create_appointment(uuid, uuid, public.appt_type, text, timestamptz, boolean, text, text, uuid[], int[]),
  public.record_break_no(uuid, public.break_type),
  public.infer_schedule(uuid),
  public.get_my_data()
  from public, anon;

grant execute on function
  public.create_household_with_membership(text, text),
  public.create_invite(public.member_role, interval, int),
  public.redeem_invite(text),
  public.replace_feed_times(uuid, time[]),
  public.replace_medications(uuid, jsonb),
  public.create_appointment(uuid, uuid, public.appt_type, text, timestamptz, boolean, text, text, uuid[], int[]),
  public.infer_schedule(uuid),
  public.get_my_data()
  to authenticated;

-- record_break_no is service-role only: it is called by the log-action Edge Function,
-- never directly by a client.
grant execute on function public.record_break_no(uuid, public.break_type) to service_role;
