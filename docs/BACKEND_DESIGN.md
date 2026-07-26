# PawClock Backend — Implementation Design & Work Breakdown

**Basis:** `docs/BACKEND_PLAN.md` (plan of record) reconciled against the actual code at
commit `e55f5ac` (main, 2026-07-23). This document is the *implementation* design: what to
build, in what order, with what verification — plus the places where the plan's audit is
now stale because the FE track already fixed things.

Read this alongside `BACKEND_PLAN.md` §2 (full DDL), §3 (pipeline), §6 (API surface).
Where this doc and BACKEND_PLAN.md disagree, **this doc wins** — every disagreement is an
explicit, numbered delta (Δ1–Δ6 below) with rationale.

---

## 0. Ground truth — the code has moved past the plan's audit

Verified in code at `e55f5ac`. This matters because SYNC-1 (the FE repo swap) is *thinner*
than the plan budgeted for — several model fixes the backend schema was designed to force
have already landed client-side.

| BACKEND_PLAN §0 claim | Reality at `e55f5ac` | Consequence |
|---|---|---|
| #1 Appointments store `petNames: ["🐶 Mochi"]` | **Fixed** — `Appointment.petIds: string[]`, resolved at render | `appointment_pets` join maps 1:1; no display-string migration needed |
| #2 Countdown materialized at creation | **Fixed** — only `dateTime: number` stored; countdown computed at render | none |
| #3 Free-form date strings, no year | **Fixed** — `dateTime` epoch ms + `hasTime: boolean` | Δ2: `hasTime` ↔ `all_day` inversion |
| #8 Reminder toggles discarded | **Fixed** — `reminderOffsets: number[]` (minutes) | maps 1:1 to `appointment_reminders.offset_minutes` |
| #6 Logs store presentation (icon/label/time string) | **Partially fixed** — `sub`/formatted time gone (D5); `icon`+`label` remain, and **`label` is load-bearing** (see Δ1) | Δ1: slot identity must survive normalization |
| #4 Age is static string | Still true — `Pet.age: '2 yrs'`, no birthdate | schema keeps nullable `birthdate`; FE adds picker at SYNC-1 |
| #5 `meta` denormalized | Still true | dropped server-side, derived at render |
| #7 Feed/med times are 12-h strings | Still true — `'7:30 AM'`, parsed by `parseClockTime` | repo adapter converts to `HH:MM` at the seam |
| #9 IDs from `Date.now()` / slugs | Still true — `mochi`, `appt-${Date.now()}`, `pee-${ts}-${rand5}` | client UUID v4 becomes part of the frozen contract at SYNC-1 |
| #10 Calibration keyed to createdAt, client-only | Still true | `calibration_started_at` + server `infer_schedule` |

Also present and relevant, not covered by the plan's audit:

- `context/NudgesContext.tsx` — meal-banner snoozes, local state. Server analogue is
  `prediction_state.snoozed_until` (breaks) — meal snoozes stay client-side in v1.
- `hooks/useDeletePetCascade.ts` — client cascade across the three contexts. Server-side this
  is `pets.archived_at` soft-delete + FK cascade semantics; the hook survives as the local
  optimistic path.
- `getTodaysMedications()` marks meds "done" purely by clock time (no med log type exists).
  Backend fixes this properly: `log_type` includes `medication`, `logs.medication_id` links
  the dose — logged-done semantics for meds arrive with the swap.

---

## 1. Architecture overview

Supabase (committed in BACKEND_PLAN §1). One Postgres with RLS as the authorization wall,
`pg_cron` + `pg_net` driving a Deno Edge Function dispatcher, Expo Push for delivery,
Postgres Changes for realtime household fan-out.

```
                    ┌──────────────────────── Supabase project ────────────────────────┐
  RN app (FE track) │                                                                  │
 ┌───────────────┐  │  PostgREST/RLS   ┌──────────┐  triggers   ┌──────────────────┐   │
 │ contexts      │◄─┼──────────────────┤ Postgres │────────────►│ prediction_state │   │
 │  └ repo seam ─┼──┼─► logs/pets/appts└──────────┘  recompute  └──────┬───────────┘   │
 │ SQLite mirror │  │        ▲                                         │ notify_at due │
 │ outbox        │  │        │ realtime: Postgres Changes              ▼               │
 └──────┬────────┘  │        │ (household channel)          pg_cron ─► dispatch-       │
        │ push tap  │        │                              (1 min)    notifications   │
        ▼           │        │                                         │ dedupe insert │
 ┌───────────────┐  │  ┌─────┴──────┐    idempotent write              ▼               │
 │ OS notification│─┼─►│ log-action │◄───(actionToken JWT)──── Expo Push API ──► both  │
 │ Yes/No/Snooze │  │  └────────────┘                                        owners'   │
 └───────────────┘  │                                                        phones    │
                    └──────────────────────────────────────────────────────────────────┘
```

Authoritative predictions live server-side (`prediction_state`, maintained by trigger);
`lib/petSchedule.ts` stays as the client's optimistic mirror of the identical algorithm.

---

## 2. The frozen contract (and its deltas)

The contract = **client models** (`lib/db/models.ts`, BACKEND_PLAN §6.1) + **push payload**
(`shared/notificationContracts.ts`, §3.4) + **repo operations** (§6.2). The FE track builds
against these shapes. Deltas against the plan, decided now:

### Δ1 — Meal-slot identity: `logs.feed_time_id`, not a label column
`getTodaysMeals()` (petSchedule.ts:256) matches food logs to meal slots **by `label` name**
("Dinner" log flips the Dinner row, even out of order) — deliberate FE behavior. The plan's
fix #6 ("drop icon/label") would silently regress it. Resolution: slot identity is not
presentation — it's a relation. Add to `logs`:

```sql
feed_time_id uuid references public.feed_times(id) on delete set null,
```

A food log that covers a specific slot references that `feed_times` row (mirroring the
already-planned `medication_id` pattern). Name-matching becomes id-matching; the
chronological-fallback pass (pass 2) still covers id-less logs. Bonus alignment: meal push
dedupe keys are already `meal:{feed_time_id}:{local_date}`, and a LOG_YES on a meal push
writes the log with that `feed_time_id`. Light integrity checks:

```sql
check (feed_time_id is null or type = 'food'),
check (medication_id is null or type = 'medication')
```

### Δ2 — `hasTime` ↔ `all_day`
FE stores `hasTime: boolean`; schema stores `all_day boolean not null default false`.
Mapping at the repo seam: `all_day = not hasTime`. Schema wins server-side (matches
calendar-domain convention); FE keeps `hasTime` in its model if it wants.

### Δ3 — Client model for logs keeps derived `icon`/`label` OUT of the DB
`TimelineEntry.icon/label` survive in the client *view* layer only. The repo returns
`LogEntry` (type, occurredAt, note, feedTimeId, medicationId, source); `Timeline`/`getTodaysMeals`
derive presentation from `type` + `feed_time_id`→slot name. This is the one place SYNC-1
touches FE internals beyond the repo seam — flagged for the FE dev.

### Δ4 — ID generation moves to UUID v4 at the seam, not before
Backend requires client-generated UUID v4 PKs (offline idempotency). Current FE IDs
(`mochi`, `appt-1753…`) are fine until SYNC-1; the swap adapter generates UUIDs for new
rows and maps legacy seed IDs only in the local→server migration path. No FE change before
SYNC-1 is required (though adopting `expo-crypto` UUIDs early is cheap and recommended —
note for FE dev).

### Δ5 — Households timezone check becomes a trigger, not a CHECK
The plan's `check ((now() at time zone timezone) is not null)` "works" by raising, not by
returning false, and embeds a volatile function in a CHECK. Same guarantee, cleaner:
`before insert or update` validation trigger that attempts the conversion and raises
`INVALID_TIMEZONE`. Behavior identical, error message deliberate.

### Δ6 — `pets.age`/`meta` never reach the server
`birthdate date` (nullable) is the only server field. The SYNC-1 adapter sends
`birthdate: null` until the FE ships its birthdate picker; `age`/`meta` render client-side
from whatever exists. Nothing blocks on the picker.

Everything else in BACKEND_PLAN §2–§7 is adopted as written: 14 tables + `app` schema,
`recompute_prediction` PL/pgSQL port, dual idempotency gates in `log-action`,
`dedupe_key` unique constraint, quiet hours, HS256 action tokens (3 h, single-use via
compare-and-set), LWW sync, one-channel-per-household realtime, rate-limit token bucket.

---

## 3. Repository layout (backend track's files)

```
supabase/
  config.toml                      # anonymous sign-in ON, auth + realtime config
  seed.sql                         # demo-world parity: Mochi/Luna/Peanut + 3 appts (now()-relative)
  migrations/
    0001_extensions.sql            # pg_cron, pg_net, app schema
    0002_enums.sql                 # species, log_type, log_source, appt_type, break_type,
                                   #   notif_kind, notif_status, member_role
    0003_core.sql                  # profiles, households(+tz trigger Δ5), household_members,
                                   #   household_invites, pets, feed_times, medications,
                                   #   logs(+Δ1 cols), appointments, appointment_pets,
                                   #   appointment_reminders  (+ all indexes)
    0004_push_predictions.sql      # notification_tokens, prediction_state, notifications
    0005_functions_triggers.sql    # touch_updated_at, sync_reminder_fire_at, handle_new_user,
                                   #   recompute_prediction, on_log_insert, on_pet_schedule_change
    0006_rls.sql                   # enable RLS everywhere + all policies + app.is_member
    0007_rpcs.sql                  # create_household_with_membership, redeem_invite,
                                   #   create_invite, infer_schedule, replace_feed_times,
                                   #   replace_medications, create_appointment, get_my_data
    0008_rate_limits.sql           # app.rate_limits token bucket + helper fn
    0009_cron.sql                  # cron.schedule entries (dispatch/receipts/recalibrate)
  tests/
    001_rls_isolation.sql          # pgTAP: cross-household reads/writes denied, per table
    002_membership_rpcs.sql        # pgTAP: bootstrap, invite expiry/max-uses/revoked/self-redeem
    003_prediction_math.sql        # pgTAP: anchor=last log; feed-time fallback; roll-forward;
                                   #   buffer clamp 10..45; snooze reset; no-count reset
    004_triggers.sql               # pgTAP: supersede-on-insert, reminder fire_at resync,
                                   #   touch_updated_at, profile bootstrap
    005_infer_schedule.sql         # pgTAP: parity fixtures vs lib/petSchedule.ts expectations
  functions/
    _shared/                       # supabase client factory, token sign/verify, expo push,
                                   #   rate-limit check, quiet-hours helper
    dispatch-notifications/index.ts
    log-action/index.ts
    check-receipts/index.ts
    recalibrate/index.ts
    delete-account/index.ts
shared/
  notificationContracts.ts         # BreakPushData, MealPushData, MedPushData, ApptPushData,
                                   #   CATEGORY_*, action ids — imported by app AND functions
lib/db/
  types.gen.ts                     # supabase gen types typescript --local (generated)
  models.ts                        # hand-written client models (§6.1 + Δ1..Δ6)
.github/workflows/backend.yml      # BE-5: db lint+test, functions deploy, staging push
```

`shared/notificationContracts.ts` and `lib/db/models.ts` land in **BE-1** — they are the
frozen handoff and must exist before the FE builds FE-3 against them.

---

## 4. Work breakdown

### BE-1 — Foundations *(the current milestone)*

Ordered; each step has a verification gate. No step needs the RN app.

| # | Step | Verify |
|---|---|---|
| 0 | Toolchain: Node LTS, Docker Desktop (WSL2), Supabase CLI; `git switch -c BE-foundations` | `supabase start` boots the full stack |
| 1 | `supabase init` + `config.toml` (enable anonymous sign-ins, realtime) | `supabase status` shows services |
| 2 | Migrations 0001–0004 (extensions, enums, all tables incl. Δ1/Δ5 changes) | `supabase db reset` clean; `\d+` spot-checks |
| 3 | Migration 0005 (functions + triggers, incl. `recompute_prediction`) | psql: insert log → `prediction_state` row appears with correct `notify_at` |
| 4 | Migration 0006 (RLS) + 0007 (RPCs) + 0008 (rate limits) | psql as two fake users: cross-household select returns 0 rows |
| 5 | `seed.sql` demo-world parity (3 pets in the 3 calibration states, 3 appts, today's timeline) | `db reset` then Studio eyeball + count asserts |
| 6 | pgTAP suites 001–005 | `supabase test db` green |
| 7 | `gen types` → `types.gen.ts`; author `models.ts` + `shared/notificationContracts.ts` | `tsc --noEmit` on the repo |
| 8 | 0009 cron registrations (pointing at local functions URL for now) | `select * from cron.job` |
| 9 | Push branch, open PR with schema walkthrough for the FE dev (SYNC-1 kickoff doc) | PR up; FE dev can `supabase start` locally |

Definition of done = the SYNC-1 promise from PLAN.md: *schema + anonymous auth live; FE can
swap `lib/repo/local.ts` for a Supabase-backed repo against a local/staging stack.*

### BE-2 — Offline sync infra
Realtime publication config + `replica identity full` on synced tables; delta-pull cursor
semantics (`greatest(updated_at, created_at) > :cursor`, logs by `created_at`); tombstone
delivery (soft-delete rows must keep flowing to clients); reconnect → pull contract.
**Verify:** Studio/`curl` channel subscribe; psql-driven change → event received; pull query
returns tombstones.

### BE-3 🚩 — Flagship push loop
`_shared` helpers → `dispatch-notifications` (4 due-queries, dedupe-key gate, quiet hours,
`for update skip locked`, roll `notify_at` forward post-send) → `log-action` (Gate 1
compare-and-set on `notifications.status`, Gate 2 client-UUID PK insert, SNOOZE_15 / LOG_NO
paths, `app_record_break_no` RPC) → `check-receipts` (DeviceNotRegistered → revoke token).
**Verify:** `functions serve` + curl matrix: replayed cron tick sends once; double-tap
claims once; manual-log-then-tap no-ops; expired token → 401; snooze re-asks.

### BE-4 — Calibration + sharing
`infer_schedule` (already in 0007) + nightly `recalibrate` (EWMA 14-day, 30/70 blend,
auto-apply for calibrating pets after day 3, `consecutive_no_count ≥ 3` → +0.5 h);
invite create/redeem hardening + deep-link route contract; Apple/Google `linkIdentity`
config; `delete-account` + `get_my_data`; med escalation, vaccine recurrence
(`recurrence_months`), weekly digest + `daily_pet_stats` rollup.
**Verify:** pgTAP parity fixtures; psql RPC calls; cron dry-runs.

### BE-5 — Hardening + launch
Rate limiting wired into every Edge Function; Sentry (functions + app DSN handoff);
GitHub Actions: `supabase db lint` + `test db` on PR, `db push` + `functions deploy` to
staging on merge; EAS build config handoff; store-review push-priming notes.
**Verify:** CI green on a scratch PR; staging smoke test with a manually registered
Expo push token.

### Sync points (unchanged from PLAN.md §4)
SYNC-1 after BE-1 (~repo swap, FE ~4 d) · SYNC-2 after BE-3 (point `responseHandler` at
`log-action`, ~2 d) · SYNC-3 after BE-4 (sharing UI, ~3 d) · SYNC-4 final week (two-device QA).

---

## 5. Local dev & environment

- Windows 11 host. Required: Node LTS, Docker Desktop (WSL2 backend), Supabase CLI.
  As of writing **none are installed** — BE-1 step 0.
- `supabase start` → full stack; app later reads `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` (LAN IP for device testing).
- Push testing needs a dev build (Expo Go dropped remote push, SDK 53+). BE-3 local loop:
  curl the dispatcher, assert `notifications` rows; real pushes against hosted staging with
  a manually registered token.
- Secrets: `ACTION_TOKEN_SECRET` + service-role key in `supabase/.env.local` (gitignored)
  locally, Vault + function env in hosted. Only the anon key ever reaches the app.

## 6. Risks / open items

1. **Toolchain not installed** (blocks BE-1 step 0; Docker Desktop may need admin + reboot).
2. **GitHub push access** to `pesrinadh-art/PetClock` untested from this machine.
3. **FE coordination on Δ3/Δ4** (derived log presentation, UUID adoption) — cheap now,
   costly at SYNC-1 if unflagged. Surface in the BE-1 PR description.
4. **pg_cron → local Edge Function URL** differs from hosted (kong vs project URL) — keep
   0009 idempotent and environment-aware (vault-driven URL, per the plan).
5. **Realtime RLS on `logs`** requires the household filter + private channel config —
   validate early in BE-2, it's the flagship's fan-out path.
