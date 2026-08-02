-- 0015_realtime_and_sync.sql
-- BE-2: realtime fan-out and delta-pull sync.
--
-- Two delivery paths, deliberately:
--
--   Realtime  — the app is OPEN. Postgres Changes push row events to every household
--               member's device, so Owner B's timeline updates the instant Owner A logs.
--   Delta-pull — the app was CLOSED. On foreground or reconnect it asks "what changed
--               since X" and catches up in one round trip.
--
-- Both must agree about deletes. Nothing here is ever hard-deleted; a delete is an UPDATE
-- setting deleted_at. That row is a TOMBSTONE and has to keep flowing, or a log undone on
-- one phone would live forever on the other.

-- ---------------------------------------------------------------------------
-- 1. A uniform sync cursor
-- ---------------------------------------------------------------------------
-- Every synced table needs one column that changes on ANY mutation, so the client can hold
-- a single cursor instead of one per table.
--
-- `logs` was the gap. It is append-only, so it only had created_at — but a soft delete
-- updates deleted_at WITHOUT touching created_at. A created_at cursor would therefore skip
-- every undo, and undone logs would never disappear from the other device.

alter table public.logs add column if not exists updated_at timestamptz;

update public.logs set updated_at = greatest(created_at, coalesce(deleted_at, created_at))
 where updated_at is null;

alter table public.logs alter column updated_at set default now();
alter table public.logs alter column updated_at set not null;

create trigger trg_touch_logs before update on public.logs
  for each row execute function app.touch_updated_at();

-- Cursor indexes. Household-scoped tables lead with household_id because the pull is
-- always scoped to one household; pet-scoped children lead with pet_id.
create index if not exists idx_logs_cursor         on public.logs(household_id, updated_at);
create index if not exists idx_pets_cursor         on public.pets(household_id, updated_at);
create index if not exists idx_appts_cursor        on public.appointments(household_id, updated_at);
create index if not exists idx_feed_times_cursor   on public.feed_times(pet_id, updated_at);
create index if not exists idx_medications_cursor  on public.medications(pet_id, updated_at);

-- ---------------------------------------------------------------------------
-- 2. Child tables surface through their parent
-- ---------------------------------------------------------------------------
-- appointment_pets and appointment_reminders carry no timestamps of their own, and giving
-- them cursors would mean publishing and reconciling two more tables client-side.
--
-- Instead, changing a child touches the parent appointment. One cursor, one realtime event,
-- and the client re-reads the whole appointment with its children attached — which is how
-- it consumes them anyway.

create or replace function app.touch_parent_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.appointments
     set updated_at = now()
   where id = coalesce(new.appointment_id, old.appointment_id);
  return null;
end $$;

create trigger trg_appt_pets_touch_parent
  after insert or update or delete on public.appointment_pets
  for each row execute function app.touch_parent_appointment();

create trigger trg_appt_reminders_touch_parent
  after insert or update or delete on public.appointment_reminders
  for each row execute function app.touch_parent_appointment();

-- ---------------------------------------------------------------------------
-- 3. Replica identity
-- ---------------------------------------------------------------------------
-- Default replica identity puts only the primary key in the WAL for UPDATE and DELETE.
-- Two things break with that:
--
--   * Realtime cannot evaluate RLS against the OLD row, so it cannot safely decide who was
--     allowed to see a row that changed.
--   * The client receives a delete/update event it cannot match to local state beyond the id.
--
-- FULL writes the entire old row. It costs WAL volume, which at household scale is noise.

alter table public.pets            replica identity full;
alter table public.feed_times      replica identity full;
alter table public.medications     replica identity full;
alter table public.logs            replica identity full;
alter table public.appointments    replica identity full;

-- ---------------------------------------------------------------------------
-- 4. Publication membership
-- ---------------------------------------------------------------------------
-- The publication was EMPTY — realtime was entirely unconfigured, so no client could ever
-- have received an event.
--
-- Deliberately NOT published:
--
--   prediction_state — updates on every log AND on every dispatch, and the client already
--     computes the identical prediction locally from the same inputs (that parity is
--     enforced by 003_prediction_math). Publishing it would double the traffic to tell the
--     client something it can already derive the moment the log event lands.
--
--   notifications / notification_tokens — a push token is PII and the notification row is
--     the idempotency spine. Neither belongs on a broadcast channel.
--
--   appointment_pets / appointment_reminders — surfaced through the parent, see section 2.

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_table in array array['pets','feed_times','medications','logs','appointments']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Delta pull
-- ---------------------------------------------------------------------------
-- One round trip for "what changed since I last looked".
--
-- SECURITY INVOKER, deliberately: this runs as the caller so RLS scopes every row to the
-- caller's household. A SECURITY DEFINER version would hand over every household's data.
--
-- Tombstones are INCLUDED, not filtered. A row with deleted_at set is the only signal the
-- client gets that something was undone elsewhere; dropping them would strand deleted rows
-- on every other device forever.

create or replace function public.pull_changes(p_since timestamptz default '-infinity')
returns jsonb
language sql security invoker stable set search_path = public as $$
  select jsonb_build_object(
    -- The client stores this and sends it back next time. Server clock, never the
    -- device's — a phone with a skewed clock would otherwise skip or replay changes.
    'serverTime', now(),

    'pets', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.updated_at)
        from public.pets p where p.updated_at > p_since), '[]'::jsonb),

    'feedTimes', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.updated_at)
        from public.feed_times f where f.updated_at > p_since), '[]'::jsonb),

    'medications', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.updated_at)
        from public.medications m where m.updated_at > p_since), '[]'::jsonb),

    'logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.updated_at)
        from public.logs l where l.updated_at > p_since), '[]'::jsonb),

    -- Appointments arrive whole, with their children attached, because that is the shape
    -- the client model uses (petIds + reminderOffsetsMinutes).
    'appointments', coalesce((
      select jsonb_agg(
               to_jsonb(a)
               || jsonb_build_object(
                    'pet_ids', coalesce((
                      select jsonb_agg(ap.pet_id)
                        from public.appointment_pets ap
                       where ap.appointment_id = a.id), '[]'::jsonb),
                    'reminder_offsets_minutes', coalesce((
                      select jsonb_agg(r.offset_minutes order by r.offset_minutes)
                        from public.appointment_reminders r
                       where r.appointment_id = a.id), '[]'::jsonb))
               order by a.updated_at)
        from public.appointments a where a.updated_at > p_since), '[]'::jsonb)
  );
$$;

revoke execute on function public.pull_changes(timestamptz) from public, anon;
grant execute on function public.pull_changes(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Household membership lookup for the realtime channel
-- ---------------------------------------------------------------------------
-- The client needs its household id to name the channel and to filter household-scoped
-- subscriptions. It is one row, but it is the first thing every session needs.

create or replace function public.my_household_id()
returns uuid
language sql security invoker stable set search_path = public as $$
  select household_id
    from public.household_members
   where user_id = auth.uid()
     and (member_expires_at is null or member_expires_at > now())
   order by joined_at
   limit 1;
$$;

revoke execute on function public.my_household_id() from public, anon;
grant execute on function public.my_household_id() to authenticated, service_role;
