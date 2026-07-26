-- seed.sql — demo-world parity with data/mockData.ts
--
-- Runs after every `supabase db reset`, so a fresh local stack looks exactly like the
-- mock app the FE dev is working against today: Mochi calibrating, Luna fully scheduled,
-- Peanut needing info, the same four timeline entries and the same three appointments.
--
-- Two users share one household, because the whole point of the backend is the
-- two-caregiver case that the in-memory app cannot express at all.
--
-- Fixed UUIDs (stable across resets, so tests and manual psql poking can hardcode them):
--   household  aaaaaaaa-…-000000000001
--   users      11111111-… (Sam, owner)   22222222-… (Alex, member)
--   pets       bbbbbbbb-…-0001 Mochi     -0002 Luna      -0003 Peanut
--   meds       cccccccc-…-0001 Joint     -0002 Allergy
--   logs       dddddddd-…-0001..0004     (the four mockData timeline entries)
--   appts      eeeeeeee-…-00a1..00a3
--
-- Local credentials (both users): password123

-- ---------------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------------
-- app.handle_new_user() fires on insert here and creates the matching profiles row.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'demo@pawclock.test',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Sam"}',
   '', '', '', ''),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@pawclock.test',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Alex"}',
   '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'email',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"demo@pawclock.test","email_verified":true}',
   now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'email',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"partner@pawclock.test","email_verified":true}',
   now(), now(), now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Household — Sam owns it, Alex is the second caregiver
-- ---------------------------------------------------------------------------

insert into public.households (id, name, timezone, quiet_hours_start, quiet_hours_end, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo Household', 'America/Los_Angeles',
        '22:00', '07:00', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Pets — one per calibration state, mirroring mockData.ts
-- ---------------------------------------------------------------------------

insert into public.pets
  (id, household_id, name, avatar_emoji, species, breed, birthdate,
   pee_hold_hours, poop_hold_hours, calibration_started_at)
values
  -- Mochi: no schedule, created ~1.2 days ago -> the "calibrating (day 2 of 3)" state.
  -- Has a medication, which must still produce reminders while calibrating.
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Mochi', '🐶', 'dog', 'Golden Retriever',
   (current_date - interval '2 years')::date, null, null, now() - interval '1.2 days'),

  -- Luna: fully configured -> the "ready" state with live predictions.
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Luna', '🐱', 'cat', 'Tabby Cat',
   (current_date - interval '1 year')::date, 4, 6, now() - interval '10 days'),

  -- Peanut: no schedule, created 5 days ago -> past calibration, the "needs info" prompt.
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Peanut', '🐰', 'rabbit', 'Rabbit',
   (current_date - interval '3 years')::date, null, null, now() - interval '5 days')
on conflict (id) do nothing;

-- Luna's feed times: '7:30 AM' / '6:00 PM' as real `time` values.
-- Inserting these fires trg_feed_times_change, which builds her prediction_state rows.
insert into public.feed_times (pet_id, local_time, active) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '07:30', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', '18:00', true)
on conflict (pet_id, local_time) do nothing;

insert into public.medications (id, pet_id, name, dosage, local_time, active) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'Joint supplement', null, '18:00', true),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Allergy pill', null, '08:00', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Logs — the four timeline entries from mockData.ts, at today's local clock times
-- ---------------------------------------------------------------------------
-- Times resolve through the household timezone, so the seed lands on the same wall clock
-- regardless of the server's own zone.

insert into public.logs
  (id, household_id, pet_id, type, occurred_at, note, source, created_by)
select v.id::uuid,
       'aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000001',
       v.type::public.log_type,
       (date_trunc('day', now() at time zone h.timezone) + v.at::interval)
         at time zone h.timezone,
       v.note,
       'manual',
       '11111111-1111-1111-1111-111111111111'
  from public.households h
  cross join (values
    ('dddddddd-0000-0000-0000-000000000001', 'pee',  '12:31', null),
    ('dddddddd-0000-0000-0000-000000000002', 'food', '12:00', 'Lunch'),
    ('dddddddd-0000-0000-0000-000000000003', 'vet',  '10:00', 'Vet Checkup'),
    ('dddddddd-0000-0000-0000-000000000004', 'poo',  '09:15', null)
  ) as v(id, type, at, note)
 where h.id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- Extra, beyond mockData.ts parity: a short history for Luna so prediction_state has real
-- values to show and infer_schedule() has something to chew on. Mochi's four entries above
-- are the exact mock set; these are additive and clearly separate.
insert into public.logs (id, household_id, pet_id, type, occurred_at, source, created_by)
select gen_random_uuid(),
       'aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       t.type::public.log_type,
       now() - make_interval(mins => (t.hours_ago * 60)::int),
       'manual',
       -- Alternating authors: proves two caregivers feed one shared prediction.
       case when (t.hours_ago * 10)::int % 2 = 0
            then '11111111-1111-1111-1111-111111111111'::uuid
            else '22222222-2222-2222-2222-222222222222'::uuid end
  from (values
    ('pee', 1.5), ('pee', 5.5), ('pee', 9.5), ('pee', 14.0),
    ('poo', 3.0), ('poo', 9.0), ('poo', 15.0),
    ('food', 2.0), ('food', 12.5)
  ) as t(type, hours_ago);

-- ---------------------------------------------------------------------------
-- Appointments — the three from mockData.ts
-- ---------------------------------------------------------------------------
-- Written directly rather than through create_appointment() because seeding runs without
-- an auth.uid(); the reminder fire_at values are computed the same way the RPC does.

insert into public.appointments
  (id, household_id, type, title, starts_at, all_day, location)
values
  -- ~2 days out -> the "soon" countdown.
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001',
   'vet', 'Annual Checkup',
   date_trunc('day', now()) + interval '2 days' + interval '10 hours', false, 'City Vet Clinic'),
  -- ~10 days out -> "upcoming".
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001',
   'groom', 'Full Groom & Bath',
   date_trunc('day', now()) + interval '10 days' + interval '14 hours', false, 'Paws & Claws'),
  -- ~12 days ago, date-only (hasTime: false -> all_day: true, per Δ2) -> "overdue".
  ('eeeeeeee-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001',
   'vaccine', 'Rabies Booster',
   date_trunc('day', now()) - interval '12 days' + interval '9 hours', true, null)
on conflict (id) do nothing;

insert into public.appointment_pets (appointment_id, pet_id) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('eeeeeeee-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-000000000003')
on conflict do nothing;

-- reminderOffsets from mockData.ts: [1440] and [10080, 1440]; Rabies Booster had none.
insert into public.appointment_reminders (appointment_id, offset_minutes, fire_at)
select a.id, o.offset_minutes, a.starts_at - make_interval(mins => o.offset_minutes)
  from public.appointments a
  join (values
    ('eeeeeeee-0000-0000-0000-0000000000a1'::uuid, 1440),
    ('eeeeeeee-0000-0000-0000-0000000000a2'::uuid, 10080),
    ('eeeeeeee-0000-0000-0000-0000000000a2'::uuid, 1440)
  ) as o(appointment_id, offset_minutes) on o.appointment_id = a.id
on conflict (appointment_id, offset_minutes) do nothing;
