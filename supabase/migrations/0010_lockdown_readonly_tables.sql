-- 0010_lockdown_readonly_tables.sql
-- Defence in depth on the two tables clients may read but must never write.
--
-- Supabase applies default privileges that grant ALL on new tables in `public` to `anon`
-- and `authenticated`. RLS already stops writes to notifications and prediction_state —
-- neither has an INSERT/UPDATE/DELETE policy, so no row ever qualifies — but that
-- protection is *implicit*: it depends on a policy continuing not to exist. Adding a
-- permissive policy later, for any reason, would silently open write access.
--
-- Revoking the grants makes the intent explicit and changes the failure mode from a
-- silent zero-row UPDATE into a loud 42501. Caught by 001_rls_isolation test 22, which
-- asserted the loud version and got the quiet one.
--
-- Why it matters: `notifications` is the idempotency spine. A client that could update it
-- could flip a row's status back to 'sent' and re-claim an already-actioned notification,
-- defeating gate 1 and double-logging.

revoke insert, update, delete, truncate on public.notifications   from anon, authenticated;
revoke insert, update, delete, truncate on public.prediction_state from anon, authenticated;

-- `anon` is the unauthenticated role. Anonymous *sign-in* still produces a real user with
-- the `authenticated` role, so nothing in PawClock is served to `anon` at all. RLS returns
-- zero rows for it regardless; this removes the table grants so it cannot even try.
revoke all on public.profiles              from anon;
revoke all on public.households            from anon;
revoke all on public.household_members     from anon;
revoke all on public.household_invites     from anon;
revoke all on public.pets                  from anon;
revoke all on public.feed_times            from anon;
revoke all on public.medications           from anon;
revoke all on public.logs                  from anon;
revoke all on public.appointments          from anon;
revoke all on public.appointment_pets      from anon;
revoke all on public.appointment_reminders from anon;
revoke all on public.notification_tokens   from anon;
revoke all on public.notifications         from anon;
revoke all on public.prediction_state      from anon;
