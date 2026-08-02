# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

PawClock (repo name `PetClock`) — an Expo/React Native app for tracking pet potty breaks,
meals, medications and vet appointments.

The flagship feature is an **actionable push notification at the predicted pee/poo break
time**: "Did Mochi go? ✅ Yes / ❌ Not yet / ⏰ Snooze", where one tap writes a log with the
app closed, and the next prediction re-computes automatically. Two caregivers share one
household and one prediction. Almost every architectural decision in this repo exists to
serve that flow.

## Commands

### Frontend (Expo SDK 57, RN 0.86, React 19.2, expo-router)

```bash
npx expo start           # dev server; press i / a / w
npx expo start --web     # renders inside a 390x844 PhoneFrame
npx expo install --check # verify SDK-pinned versions before adding packages
npx tsc --noEmit         # typecheck (no test runner is configured yet)
```

Always add packages with `npx expo install`, not `npm install`, so Expo resolves the
SDK-57-pinned version.

### Backend (Supabase)

The CLI is not a repo dependency — install it separately and put it on PATH. Adding it to
`package.json` rewrites `package-lock.json` by thousands of lines and collides with the
frontend track; don't.

```bash
supabase db push                                    # apply migrations to the linked project
supabase db query --linked "select 1"               # ad-hoc SQL against staging
supabase db query --linked -f path/to/file.sql      # run a file
supabase gen types typescript --linked > lib/db/types.gen.ts

supabase start && supabase db reset                 # local stack (needs Docker + WSL2)
```

### Running the pgTAP suites

`000_helpers.sql` creates the `tests` schema and fixtures and **must be applied first**;
each suite then runs standalone (a single suite = a single file):

```bash
supabase db query --linked -f supabase/tests/000_helpers.sql
supabase db query --linked -f supabase/tests/003_prediction_math.sql
```

Each suite ends by selecting `tests_run / failed / failures`. Results are collected into a
temp table rather than streamed because the Management API returns only the final result
set — a plain pgTAP run reports a failure count with no indication of *which* test failed.
Suites wrap everything in `begin … rollback`, so they are safe against staging.

## Architecture

### The prediction algorithm exists twice, on purpose

This is the single most important thing to understand before touching either side.

- `lib/petSchedule.ts` → `getUpcomingForPet()` — the **client** copy, for instant optimistic UI
- `app.recompute_prediction()` in `supabase/migrations/0005_functions_triggers.sql` — the
  **server** copy, and the authority

Both must implement the *identical* algorithm, or the app will display one time while the
push fires at another. The server is authoritative because pushes must fire with every
device killed, and two caregivers' logs must feed one shared prediction.

The algorithm: `anchor` = most recent non-deleted log of that type, else today's earliest
active feed time in household-local time; `predicted = anchor + hold_hours`, stepping **at
most one interval**; `buffer = clamp(round(hold × 60 × 0.15), 10, 45)` minutes;
`notify_at = predicted − buffer`.

**Never make a missed prediction roll forward.** A prediction whose time has passed stays
put and reads as overdue (`nextRepeating()`, `petSchedule.ts:112`). `docs/BACKEND_PLAN.md`
contains an older loop that rolls forward — that is the pre-D7 bug the frontend already
fixed. See Δ7 in `docs/BACKEND_DESIGN.md`.

### Two parallel tracks

`PLAN.md` §4 splits the work into a frontend track (FE-1…FE-5) and a backend track
(BE-1…BE-5) that run independently and meet at four sync points. Detail lives in
`docs/FRONTEND_PLAN.md` and `docs/BACKEND_PLAN.md`.

**`docs/BACKEND_DESIGN.md` supersedes `docs/BACKEND_PLAN.md` wherever they disagree.** The
plan was written before the frontend fixed several data-model defects, and implementing it
surfaced real bugs in its SQL. Every divergence is a numbered delta (Δ1–Δ9) with rationale.
Read the deltas before changing schema or prediction logic.

### Current wiring state

The app and the backend are **not connected**. The app reads entirely from in-memory
contexts seeded from `data/mockData.ts`; nothing survives a reload. There is no
`@supabase/supabase-js` dependency, no `lib/repo/` seam, and no auth. The backend schema is
live and tested but nothing calls it. Connecting them is SYNC 1.

### Frontend layers

`app/` (expo-router routes) → three React contexts (`context/PetsContext`, `LogsContext`,
`AppointmentsContext`) → `data/mockData.ts`. `lib/petSchedule.ts` holds all the scheduling
maths as pure functions and is the piece the notification system mirrors. `NudgesContext`
holds meal-banner snoozes.

### Backend layers

Everything the client may touch is in `public` and guarded by RLS. Internal helpers live in
schema `app`, whose usage is revoked from the API roles — it is unreachable over PostgREST,
and RLS policies can call into it only because policy expressions execute as the table owner.

- **Authorization** is entirely RLS, via `app.is_member` / `is_editor` / `is_owner`. These
  are SECURITY DEFINER so policies never recurse. `is_member` honours `member_expires_at`,
  which is what makes the time-boxed walker role work.
- **Membership is RPC-only.** There is deliberately no INSERT policy on `household_members`;
  only `create_household_with_membership()` and `redeem_invite()` create it. Adding an
  INSERT policy would reopen the self-invite hole.
- **`notifications` is the idempotency spine.** A `unique dedupe_key` makes sends
  exactly-once; a compare-and-set from `'sent'` to `'actioned'` is gate 1; the
  client-generated uuid v4 log PK is gate 2. Clients have no write grant on it at all.
- **Triggers keep derived state honest** — logs, pets and feed_times all re-run
  `recompute_prediction`, and a log insert supersedes any in-flight push for the same break.

### The frozen contract

`shared/notificationContracts.ts` and `lib/db/models.ts` are the frontend/backend handoff.
They are imported by *both* the app and the Deno Edge Functions, so they must not import
from `app/`, `context/`, or any Deno-only module. Changing them is a coordinated two-sided
change.

`lib/db/types.gen.ts` is generated — never edit it by hand.

### Conventions worth knowing

- **All ids are client-generated uuid v4.** The log id *is* the offline idempotency key, so
  it must be generated once per user action and reused across retries.
- **No presentation in the database.** No icons, labels, formatted times or "2 yrs" strings.
  Store `birthdate`, `occurred_at`, `type`; derive display at the view edge. Meal-slot
  identity is a relation (`logs.feed_time_id`), not a label match — see Δ1.
- **Timezone belongs to the household, not the user.** Wall-clock values (`feed_times.local_time`)
  resolve through `households.timezone` at dispatch time, so DST is Postgres's problem.
  Daily dedupe keys embed the household-local date.
- **Soft delete everywhere** (`deleted_at`, `archived_at`) — it is both the undo window and
  the sync tombstone.
- Migrations are immutable once pushed. Fix forward with a new numbered file.
