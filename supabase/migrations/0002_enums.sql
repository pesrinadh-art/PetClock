-- 0002_enums.sql
-- Domain enums. These are part of the frozen contract: `lib/db/models.ts` and
-- `shared/notificationContracts.ts` mirror these exact string values.

-- Matches the species picker in app/add-pet.tsx.
create type public.species as enum
  ('dog','cat','rabbit','hamster','bird','turtle','snake','fish','other');

-- 'medication' is new vs the client's TimelineEntry union ('pee'|'poo'|'food'|'vet') —
-- it gives meds real logged-done semantics instead of getTodaysMedications()'s
-- clock-only guess (petSchedule.ts:304).
create type public.log_type as enum
  ('pee','poo','food','medication','vet','other');

-- How a log came to exist. 'notification_yes' is the flagship one-tap path;
-- 'walker' supports the time-boxed sitter role (BACKEND_PLAN §9.7).
create type public.log_source as enum
  ('manual','notification_yes','backfill','import','system','walker');

create type public.appt_type as enum ('vet','groom','vaccine','other');

-- Only pee/poo are predicted from hold times; meals/meds are fixed wall-clock times.
create type public.break_type as enum ('pee','poo');

create type public.notif_kind as enum
  ('break_prediction','meal','medication','appointment','digest','med_escalation');

-- 'superseded' = a manual log landed between send and tap, so the push is stale.
create type public.notif_status as enum
  ('sent','actioned','dismissed','superseded','failed');

create type public.member_role as enum ('owner','member','walker');
