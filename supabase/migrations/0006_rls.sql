-- 0006_rls.sql
-- Row-level security. This is the primary authorization wall: every domain row is
-- household-scoped, and the only key that opens it is membership.
--
-- Membership checks go through SECURITY DEFINER helpers rather than inline subqueries so
-- that a policy on household_members does not have to query household_members (infinite
-- recursion). The helpers are in `app`, which is not exposed via PostgREST (0001).

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------

-- Any current member, including a time-boxed walker whose window is still open.
create or replace function app.is_member(p_household uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
       and (m.member_expires_at is null or m.member_expires_at > now())
  );
$$;

-- Members who may edit configuration. A walker can log activity but must not be able to
-- rewrite the pet's schedule or the household's appointments (BACKEND_PLAN §9.7).
create or replace function app.is_editor(p_household uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
       and m.role in ('owner','member')
       and (m.member_expires_at is null or m.member_expires_at > now())
  );
$$;

create or replace function app.is_owner(p_household uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
       and m.role = 'owner'
  );
$$;

-- Convenience: the household a pet belongs to (used by child-table policies).
create or replace function app.pet_household(p_pet uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select household_id from public.pets where id = p_pet;
$$;

grant execute on function app.is_member(uuid), app.is_editor(uuid),
                          app.is_owner(uuid),  app.pet_household(uuid)
  to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Nothing is readable by default.
-- ---------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.households            enable row level security;
alter table public.household_members     enable row level security;
alter table public.household_invites     enable row level security;
alter table public.pets                  enable row level security;
alter table public.feed_times            enable row level security;
alter table public.medications           enable row level security;
alter table public.logs                  enable row level security;
alter table public.appointments          enable row level security;
alter table public.appointment_pets      enable row level security;
alter table public.appointment_reminders enable row level security;
alter table public.notification_tokens   enable row level security;
alter table public.notifications         enable row level security;
alter table public.prediction_state      enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles — self, plus fellow household members (to render "logged by Alex")
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or exists (
    select 1
      from public.household_members m1
      join public.household_members m2 using (household_id)
     where m1.user_id = auth.uid()
       and m2.user_id = profiles.user_id
  )
);
create policy profiles_update on public.profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Households
-- ---------------------------------------------------------------------------

create policy households_select on public.households for select
  using (app.is_member(id));
create policy households_insert on public.households for insert
  with check (created_by = auth.uid());
create policy households_update on public.households for update
  using (app.is_owner(id)) with check (app.is_owner(id));
create policy households_delete on public.households for delete
  using (app.is_owner(id));

-- ---------------------------------------------------------------------------
-- Membership — readable by members, but INSERT is RPC-only
-- ---------------------------------------------------------------------------
-- There is deliberately NO insert policy. Membership is created exclusively by the
-- SECURITY DEFINER RPCs in 0007 (create_household_with_membership, redeem_invite).
-- A direct insert policy would let anyone who guessed a household id add themselves.

create policy members_select on public.household_members for select
  using (app.is_member(household_id));

create policy members_delete on public.household_members for delete using (
  user_id = auth.uid()                       -- leave the household yourself
  or app.is_owner(household_id)              -- or an owner removes someone
);

create policy members_update on public.household_members for update
  using (app.is_owner(household_id)) with check (app.is_owner(household_id));

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
-- Note: redemption does NOT read through this policy — redeem_invite() is SECURITY
-- DEFINER precisely because the recipient is not yet a member and so cannot select the row.

create policy invites_select on public.household_invites for select
  using (app.is_member(household_id));
create policy invites_insert on public.household_invites for insert
  with check (app.is_editor(household_id) and created_by = auth.uid());
create policy invites_update on public.household_invites for update
  using (app.is_editor(household_id)) with check (app.is_editor(household_id));

-- ---------------------------------------------------------------------------
-- Pets and schedule config — editors write, walkers read
-- ---------------------------------------------------------------------------

create policy pets_select on public.pets for select
  using (app.is_member(household_id));
create policy pets_insert on public.pets for insert
  with check (app.is_editor(household_id));
create policy pets_update on public.pets for update
  using (app.is_editor(household_id)) with check (app.is_editor(household_id));
create policy pets_delete on public.pets for delete
  using (app.is_editor(household_id));

create policy feed_times_select on public.feed_times for select
  using (app.is_member(app.pet_household(pet_id)));
create policy feed_times_write on public.feed_times for all
  using (app.is_editor(app.pet_household(pet_id)))
  with check (app.is_editor(app.pet_household(pet_id)));

create policy medications_select on public.medications for select
  using (app.is_member(app.pet_household(pet_id)));
create policy medications_write on public.medications for all
  using (app.is_editor(app.pet_household(pet_id)))
  with check (app.is_editor(app.pet_household(pet_id)));

-- ---------------------------------------------------------------------------
-- Logs — any member (incl. walker) may log; the pet must belong to that household
-- ---------------------------------------------------------------------------

create policy logs_select on public.logs for select
  using (app.is_member(household_id));

create policy logs_insert on public.logs for insert with check (
  app.is_member(household_id)
  and created_by = auth.uid()
  -- Prevents writing a log into household A that points at household B's pet.
  and exists (
    select 1 from public.pets p
     where p.id = pet_id and p.household_id = logs.household_id
  )
);

-- Update exists for soft-delete (undo) and note edits only; logs are otherwise immutable
-- facts. Hard delete is never permitted — tombstones are what sync relies on.
create policy logs_update on public.logs for update
  using (app.is_member(household_id)) with check (app.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Appointments — editors only (a walker sees them but cannot change them)
-- ---------------------------------------------------------------------------

create policy appts_select on public.appointments for select
  using (app.is_member(household_id));
create policy appts_write on public.appointments for all
  using (app.is_editor(household_id)) with check (app.is_editor(household_id));

create policy appt_pets_select on public.appointment_pets for select using (
  exists (select 1 from public.appointments a
           where a.id = appointment_id and app.is_member(a.household_id))
);
create policy appt_pets_write on public.appointment_pets for all
  using (exists (select 1 from public.appointments a
                  where a.id = appointment_id and app.is_editor(a.household_id)))
  with check (exists (select 1 from public.appointments a
                       where a.id = appointment_id and app.is_editor(a.household_id)));

create policy appt_reminders_select on public.appointment_reminders for select using (
  exists (select 1 from public.appointments a
           where a.id = appointment_id and app.is_member(a.household_id))
);
create policy appt_reminders_write on public.appointment_reminders for all
  using (exists (select 1 from public.appointments a
                  where a.id = appointment_id and app.is_editor(a.household_id)))
  with check (exists (select 1 from public.appointments a
                       where a.id = appointment_id and app.is_editor(a.household_id)));

-- ---------------------------------------------------------------------------
-- Push tokens — strictly private to their owner
-- ---------------------------------------------------------------------------
-- Deliberately NOT household-visible: a push token is PII and identifies a device.

create policy tokens_all on public.notification_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications & predictions — member-readable, service-role-writable
-- ---------------------------------------------------------------------------
-- No insert/update policies at all: only the dispatcher and log-action write these, and
-- they use the service role, which bypasses RLS. A client that could write notifications
-- could forge the idempotency spine.

create policy notifications_select on public.notifications for select
  using (app.is_member(household_id));

create policy prediction_select on public.prediction_state for select
  using (app.is_member(app.pet_household(pet_id)));

-- ---------------------------------------------------------------------------
-- API-role grants (RLS decides rows; grants decide table visibility at all)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.profiles, public.households, public.household_members, public.household_invites,
  public.pets, public.feed_times, public.medications, public.logs,
  public.appointments, public.appointment_pets, public.appointment_reminders,
  public.notification_tokens
  to authenticated;

grant select on public.notifications, public.prediction_state to authenticated;

grant all on all tables in schema public to service_role;
