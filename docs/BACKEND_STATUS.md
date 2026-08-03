# Backend track — status and to-do

Living record of the BE track. Companion to `docs/BACKEND_DESIGN.md` (the design) and
`docs/BACKEND_PLAN.md` (the original plan, now partly superseded).

**Last updated:** 2026-08-03 · **Branch:** `SYNC-4-join-household`

BE-1 ([#5](https://github.com/pesrinadh-art/PetClock/pull/5)), BE-2, BE-3 and SYNC-2
([#18](https://github.com/pesrinadh-art/PetClock/pull/18)) are all merged to `main`.

---

## Status: SYNC-4 — the join flow

**139 pgTAP assertions across 8 suites.** See `docs/SYNC4_RUNBOOK.md` for the device test.

Two phones could never share a household: every device signed in anonymously, found no
membership, and **created its own**. `create_invite` / `redeem_invite` shipped in BE-1 with
20 assertions behind them and nothing ever called them.

| Deliverable | State |
|---|---|
| Migration `0016` — `leave_household`, `join_household` | applied to staging |
| `008_join_flow` pgTAP suite | 22/22 |
| `lib/household/invites.ts` | typed RPC wrappers + human-readable errors |
| `SessionContext.join()` | switches household, re-swaps repos, re-caches |
| Settings → Household | invite code + join by code |
| `expo-dev-client` | installed (+1 dep, no lockfile churn) |

**A latent bug fixed on the way:** `SessionContext` resolved the household with an unordered
`limit 1`. It now calls `my_household_id()`, which orders by `joined_at`.

**Still open:** no push has reached a physical device. That needs EAS credentials (APNs key,
FCM v1 service account) tied to accounts only the repo owner holds.

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

## Open gaps

**Closed since:** Vault secrets are set (BE-3), `ACTION_TOKEN_SECRET` is generated, PR #5
is merged, and the free-tier pause risk is **disproved** — 1,440 dispatcher runs in 24h
with zero failures across several days, so internal `pg_cron` ticks do count as activity.

1. **`recalibrate` is a dangling cron.** `recalibrate-holds` fires nightly at 03:30 and
   calls `app.invoke_edge_function('recalibrate')`, but only three functions are deployed
   (`dispatch-notifications`, `log-action`, `check-receipts`). The job reports "succeeded"
   because `pg_net` is fire-and-forget — it queues the request and never checks the reply.
   **Hold times therefore never adapt.** BE-4.
2. **No local Docker stack** — the dev machine has no WSL, so everything is verified
   against hosted staging. `supabase start` needs `wsl --install` plus a reboot.
3. **Staging seed uses `password123`** for `demo@pawclock.test` / `partner@pawclock.test`.
   Fine for staging; this project must never be promoted to prod.
4. **Session storage is unencrypted.** `lib/db/client.ts:46` keeps the auth session in
   AsyncStorage. Needs a chunking SecureStore adapter (SecureStore caps around 2048 bytes).
5. **No realtime in the repos.** `createSyncedRepos` still uses an in-process emitter
   (`synced.ts:26`), so a partner's write does not live-update a mounted screen. The
   publication and `pull_changes` cursor shipped in BE-2; wiring them up is SYNC 3.
6. **`revokePushToken` is unwired** — no sign-out flow exists to call it from.
7. **Ownership transfer does not exist**, so the last owner of a household holding pets
   cannot leave it at all (`leave_household` refuses rather than strand the pets). BE-4.
8. **No schema home** for `pet_weights` or `appointments.recurrence_months`.

---

## To-do

BE-1, BE-2, BE-3, SYNC-1, SYNC-2 and SYNC-4 are shipped. What remains, in the order it
matters.

### SYNC 4 — put it on real phones 🚩 *(next, and it needs the repo owner)*
The join flow, the join RPCs and `expo-dev-client` are done and verified. What is left is
**credentials only**: an APNs key and an FCM v1 service account, both tied to accounts the
backend track cannot sign into. Full steps in `docs/SYNC4_RUNBOOK.md`.

Until this happens, no push has ever arrived on physical hardware — everything up to and
including Expo's API is proven, and the last hop is not.

### BE-4 — calibration and sharing
- **`recalibrate` — the cron already calls it and it does not exist.** EWMA over a 14-day
  window, 30/70 blend with the current hold, `consecutive_no_count ≥ 3` → +0.5h.
  Until this lands, hold times never adapt: a 4h pet stays 4h forever.
- **Ownership transfer**, so the last owner of a household holding pets can leave at all
- Invite deep links (`pawclock.app/join/CODE`), Apple/Google `linkIdentity`
- `delete-account`, med escalation, vaccine recurrence, weekly digest + `daily_pet_stats`

### SYNC 3 — realtime in the repos
The publication, `replica identity full` and the `pull_changes` cursor all shipped in BE-2
and are unused. `createSyncedRepos` still uses an in-process emitter (`synced.ts:26`), so a
partner's write does not live-update a mounted screen. Wire "subscribe → pull → apply" —
the ordering matters, an INSERT can land between SUBSCRIBED and the first pull.

### BE-5 — hardening and launch
- Wire `app.check_rate_limit` into every Edge Function
- SecureStore chunking adapter for the auth session (`lib/db/client.ts:46`)
- Sentry, GitHub Actions (`db lint` + tests on PR, `db push` + `functions deploy` on merge)
- Store review prep
