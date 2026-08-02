# Backend track — status and to-do

Living record of the BE track. Companion to `docs/BACKEND_DESIGN.md` (the design) and
`docs/BACKEND_PLAN.md` (the original plan, now partly superseded).

**Last updated:** 2026-08-02 · **Branch:** `BE-3-push-loop` · **BE-1 PR:** [#5](https://github.com/pesrinadh-art/PetClock/pull/5) (merged)

---

## Status: BE-1 and BE-3 complete and verified

**100 pgTAP assertions across 6 suites, all green.** The full push pipeline is live on
staging: `pg_cron` → `pg_net` → Vault → Edge Function → Postgres, verified by an actual
round trip returning `200 {"due":0,...}`.

### BE-3 — flagship push loop

| Deliverable | State |
|---|---|
| `dispatch-notifications` | deployed; four due-queries, dedupe-key gate, quiet hours |
| `log-action` | deployed; both idempotency gates |
| `check-receipts` | deployed; `DeviceNotRegistered` → token revoked |
| `_shared/` helpers | env, admin client, action tokens, Expo push |
| Migrations `0011`–`0014` | due-queries, claim gate, retention, reconciliation |
| `ACTION_TOKEN_SECRET` | generated and set |
| Vault secrets | set — **cron is no longer inert** |
| Retention | `prune_notifications`, 90 days, nightly |
| Reconciliation | `reconcile_predictions`, nightly safety net |

### End-to-end verification against staging

| Scenario | Result |
|---|---|
| Dispatcher first run | 4 due, 4 notification rows written |
| Dispatcher replayed twice | `skipped: 2`, **nothing re-sent** |
| Alice taps Yes | 1 log written |
| Alice's phone retries same tap | `replayed`, no duplicate |
| **Bob taps Yes seconds later** | `replayed`, **still exactly 1 log** |
| Manual in-app log, then stale tap | notification `superseded`, **0 logs from the tap** |
| Forged action token | `401 INVALID_TOKEN` |

### Two live bugs found and fixed during BE-3

Both were invisible in normal operation. Both now have permanent regression guards in
`006_dispatch.sql`.

1. **Gate 1 was silently disabled** (`0014`). `claim_notification` returned a composite
   type, and PostgREST serializes a NULL composite as `{"id": null, ...}` — a *truthy*
   object. So `if (!claimed)` never fired, every caller "won" the claim, and two caregivers
   tapping Yes wrote **two logs for one pee**. Observed on staging. Fixed by returning a
   scalar uuid, which serializes as JSON `null`.
2. **Permanently-due predictions** (`0013`). `notify_at` advanced by one hold from
   `predicted_at`; for a stale prediction that still landed in the past, so the row never
   left the due window and the dispatcher retried a doomed INSERT **every minute forever**.
   Fixed with `greatest(next cycle, now + hold)`.

---

## Status: BE-1 complete and verified

Everything below was *executed*, not just written. Verified against the live
`pawclock-staging` project (us-west-2, Postgres 17.6), not a local stack.

| Deliverable | State |
|---|---|
| 10 migrations (`0001`–`0010`) | applied cleanly to staging |
| 14 tables | all created, **all 14 with RLS enabled** |
| 32 RLS policies | applied |
| 9 RPCs, 17 `app` helper functions | applied |
| 18 triggers | applied |
| 4 cron jobs | registered and active — **but inert**, see gaps below |
| `seed.sql` | applied; demo world matches `data/mockData.ts` |
| 5 pgTAP suites | **85/85 assertions green** |
| `shared/notificationContracts.ts`, `lib/db/models.ts` | written, `tsc --noEmit` clean |
| `lib/db/types.gen.ts` | generated from the live schema |

### Test coverage

| Suite | Assertions | Covers |
|---|---|---|
| `001_rls_isolation` | 25 | cross-household reads/writes, forged authorship, private push tokens, service-role-only tables, anon lockout |
| `002_membership_rpcs` | 20 | household bootstrap, invite expiry/revocation/max-uses, walker time-boxing and read-only enforcement |
| `003_prediction_math` | 18 | anchor selection, one-interval stepping (Δ7), every buffer clamp boundary, undo re-anchoring, snooze/streak reset |
| `004_triggers` | 12 | profile bootstrap, `updated_at`, reminder re-arming, supersede-on-log, feed_time-driven prediction |
| `005_infer_schedule` | 10 | confidence gate, half-hour rounding, 1h floor, overnight-gap exclusion, authorization |

### Hand-verified beyond the suites

- Luna's 4h hold → `anchor → predicted` exactly **4.0000 h**, buffer **36 min**
  (`round(4×60×0.15)`); the 6h hold's `54` correctly **clamped to 45**
- Δ7 probe: anchor 10 h ago with a 4 h hold predicted **6.00 h in the past and stayed there**

### Bugs found in the plan while implementing

1. **Δ7 — the prediction roll-forward loop.** `BACKEND_PLAN.md:374` rolls predictions
   forward until they land in the future. That is the pre-D7 behaviour the frontend
   deliberately fixed; shipping it would have shown "overdue 2h" in the app while the
   server had silently moved to the next cycle.
2. **`make_interval(hours => …)` takes an int** — a 4.5 h hold silently truncated to 4 h.
3. **No trigger on `feed_times`** — a pet's first feed time would never start predictions.
4. **Δ9 — implicit write protection.** Supabase default privileges grant `ALL` on new public
   tables to `authenticated`, so writes to `notifications` / `prediction_state` were blocked
   only by the *absence* of a policy, and failed silently. Found by RLS test 22; `0010`
   revokes the grants so they fail loudly.

---

## Open gaps (BE-1 scope, not yet closed)

1. **Vault secrets are not set** — `project_url` and `service_role_key` are both absent, so
   all four cron jobs tick every minute and hit the no-op guard in `app.invoke_edge_function`.
   Nothing is dispatched. Correct by design until BE-3 exists, but do not mistake "4 active
   cron jobs" for "the pipeline is running".
2. **`ACTION_TOKEN_SECRET` not generated** — needed to sign action tokens in BE-3.
3. **PR #5 not merged.** Opened from a fork (`sakh9999:BE-foundations`) because the pushing
   account has no write access to `pesrinadh-art/PetClock`. Needs the repo owner to merge.
4. **No local Docker stack** — the dev machine has no WSL, so everything was verified
   against hosted staging. `supabase start` needs `wsl --install` plus a reboot.
5. **Free-tier pause behaviour unverified** — if internal `pg_cron` ticks do not count as
   project activity, staging sleeps after ~7 days and pushes stop. Check within the week.
6. **Staging seed uses `password123`** for `demo@pawclock.test` / `partner@pawclock.test`.
   Fine for staging; this project must never be promoted to prod.

---

## To-do

### BE-3 — flagship push loop 🚩 *(recommended next)*
Highest value remaining, and needs zero frontend files.

- `_shared/` helpers: supabase client factory, action-token sign/verify, Expo push sender,
  quiet-hours check, rate-limit wrapper
- `dispatch-notifications` — four due-queries (breaks, meals, meds, appointment reminders),
  `dedupe_key` insert gate, `for update skip locked`, roll `notify_at` forward after send
- `log-action` — gate 1 (compare-and-set `'sent'`→`'actioned'`), gate 2 (client uuid PK),
  `LOG_NO` → `record_break_no`, `SNOOZE_15` paths
- `check-receipts` — `DeviceNotRegistered` → revoke token
- Set Vault secrets and `ACTION_TOKEN_SECRET`; confirm cron actually fires
- Verify with curl: replayed tick sends once, double-tap claims once, manual-log-then-tap
  no-ops, expired token 401s

### BE-2 — offline sync infrastructure
- `supabase_realtime` publication membership; `replica identity full` on synced tables
- Delta-pull cursor semantics; tombstone delivery; reconnect contract
- Verify a household channel receives a psql-driven change

### BE-4 — calibration and sharing
- Nightly `recalibrate` (EWMA, 14-day window, 30/70 blend, `consecutive_no_count ≥ 3` → +0.5h)
- Invite deep links (`pawclock.app/join/CODE`), Apple/Google `linkIdentity`
- `delete-account`, med escalation, vaccine recurrence, weekly digest + `daily_pet_stats`

### BE-5 — hardening and launch
- Wire `app.check_rate_limit` into every Edge Function
- Sentry, GitHub Actions (`db lint` + tests on PR, `db push` + `functions deploy` on merge)
- EAS build config, store review prep

### Frontend wiring (SYNC 1) — blocked on a decision
Nothing connects the two halves: no `@supabase/supabase-js`, no `lib/repo/`, no auth.

The plan assumed FE-2 would build `lib/repo/local.ts` first, making SYNC 1 a swap of one
implementation for another. FE-2 has not started, so wiring now means building both halves,
in files the FE dev is actively working in (`context/*.tsx`, `app/_layout.tsx`, `package.json`).

Two items need FE action regardless:
- **Δ3** — `LogEntry` drops `icon`/`label`; derive at the view edge from `type` and
  `feedTimeId`. Touches `Timeline.tsx` and `getTodaysMeals()`.
- **Δ4** — ids become client-generated uuid v4, generated once per action and reused
  across retries.

### Known external blocker
Push testing needs a **dev build** — Expo Go dropped remote push in SDK 53+. Someone has to
solve this before the flagship is demonstrable end-to-end.
