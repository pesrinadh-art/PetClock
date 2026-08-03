# Backend track — status and to-do

Living record of the BE track. Companion to `docs/BACKEND_DESIGN.md` (the design) and
`docs/BACKEND_PLAN.md` (the original plan, now partly superseded).

**Last updated:** 2026-08-03 · **Branch:** `BE-REVIEW-security-fixes`

BE-1 ([#5](https://github.com/pesrinadh-art/PetClock/pull/5)), BE-2, BE-3, SYNC-2
([#18](https://github.com/pesrinadh-art/PetClock/pull/18)) and SYNC-4
([#20](https://github.com/pesrinadh-art/PetClock/pull/20)) are all merged to `main`.

---

## Status: end-to-end review — migration `0017`

**178 pgTAP assertions across 9 suites.** A full read of all 16 migrations, the three Edge
Functions and the client sync seam, verified against live staging with two probe harnesses
(49 + 7 checks). **46 of 49 isolation checks passed unmodified** — cross-household reads and
writes, forged authorship, the anon lockdown, both idempotency gates and RLS on all 14
tables all hold under live attack. Four defects did not.

| # | Defect | Severity | Fix |
|---|---|---|---|
| 1 | `record_break_no` callable by **any** authenticated user, for **any** pet | **P0** | revoke + in-body membership check |
| 2 | "Snooze 15" / "Not yet" could never produce a second push | **P0** | `reask_seq` in the dedupe key |
| 3 | Logs were not immutable — a walker rewrote history | P1 | `trg_logs_immutable` |
| 4 | Hard-deleting a pet destroyed its log history | P1 | drop the `pets` DELETE policy |
| 5 | Failed log insert stranded the notification as `actioned` | P1 | `release_notification_claim` |
| 6 | Dead push tokens were never retired | P1 | only mark checked once a receipt exists |
| 7 | An expired walker could not be re-invited | P2 | re-redeem refreshes the window |
| 8 | Unbounded household creation | P2 | 5/hour per user |
| 9 | `create_invite` picked an arbitrary household | P2 | order by `joined_at` |
| 10 | `is_owner` ignored `member_expires_at` | P2 (latent) | honour it |

**#1 — the grant hole.** `0007_rpcs.sql:434` ends its revoke with `from public, anon` and
omits `authenticated`. Supabase's default privileges grant EXECUTE on every new `public`
function to `authenticated`, so revoking PUBLIC never removed it. `0011` and `0012` get this
right; `0007` did not, and `record_break_no` is the only function there never meant for
clients. Confirmed live: `due_break_predictions` and `snooze_break` listed
`postgres, service_role`; `record_break_no` listed `authenticated, postgres, service_role`.
A stranger could suppress a household's reminders and poison `consecutive_no_count`.

**#2 — the invisible one.** The break dedupe key is
`break:{pet}:{type}:{predicted_at}`. Both re-ask paths move `notify_at` but deliberately
leave `predicted_at` alone — that is Δ7, and it is correct. But it meant the re-ask
regenerated an **identical** key, so the dispatcher's INSERT hit the unique constraint and
counted it as `skipped`. Both re-ask paths wrote state that could never become a
notification, and it looked healthy from the outside because a skip is also the normal
outcome of a replayed tick. `reask_seq` is suffixed **only when non-zero**, so no key that
has already been sent changes shape. `mark_break_dispatched` deliberately does not touch it,
preserving `0013`'s guarantee that a stale prediction re-entering the due window cannot nag.

**Verified live, through the real `pg_cron` tick:** Luna's re-ask minted
`…:pee:2026-08-02T19:56Z:r1`, a key no notification held, and the dispatcher sent it.

**One deliberate divergence from the review draft.** The log-immutability trigger guards the
client roles (`authenticated`, `anon`) rather than exempting `service_role`. Exempting
`service_role` alone would also have blocked `postgres` — every future migration and admin
backfill — turning an integrity guard into a foot-gun. It stays SECURITY INVOKER: under
SECURITY DEFINER `current_user` resolves to the owner and the guard never fires.

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
is merged, the free-tier pause risk is **disproved** (1,440 dispatcher runs in 24h with zero
failures across several days, so internal `pg_cron` ticks do count as activity), realtime
landed in `createSyncedRepos` via [#24](https://github.com/pesrinadh-art/PetClock/pull/24),
and migration `0017` closed the ten review findings above.

1. **`recalibrate` is a dangling cron.** `recalibrate-holds` fires nightly at 03:30 and
   calls `app.invoke_edge_function('recalibrate')`, but only three functions are deployed
   (`dispatch-notifications`, `log-action`, `check-receipts`). The job reports "succeeded"
   because `pg_net` is fire-and-forget — it queues the request and never checks the reply.
   **Hold times therefore never adapt.** BE-4.
2. **Push bodies render UTC.** `formatLocal()` uses `getUTCHours`, so an 11:30 AM break reads
   "Predicted around 6:30 PM". The household timezone is right there and is not plumbed into
   the due queries. **Every push a user sees is wrong today.** BE-4.
3. **`get_my_data` returns household-wide data, not the caller's.** Bob's "my data" export
   contains Alice's logs. That may be the right answer for a shared household, but it is a
   GDPR endpoint and deserves a deliberate decision rather than an accident. BE-4.
4. **Invite code space is 16× smaller than the schema comment claims.** Codes are hex from a
   uuid, so 16⁶ ≈ 16.7M, not 32⁶. Redemption is rate-limited to 5/hour/user, but users are
   free anonymous signups. BE-5.
5. **`pull_changes` has no LIMIT**, and its cursor uses `now()` — transaction start. A write
   committing after that snapshot but stamped earlier is skipped permanently. Narrow, but it
   is silent data loss. SYNC 3.
6. **Anonymous signup itself is unbounded.** `0017` caps households per *user*; nothing caps
   users. That ceiling is a Supabase dashboard setting (anonymous sign-in rate limit /
   CAPTCHA), not something a migration can reach. BE-5.
7. **No local Docker stack** — the dev machine has no WSL, so everything is verified
   against hosted staging. `supabase start` needs `wsl --install` plus a reboot.
8. **Staging seed uses `password123`** for `demo@pawclock.test` / `partner@pawclock.test`.
   Fine for staging; this project must never be promoted to prod.
9. **Session storage is unencrypted.** `lib/db/client.ts:46` keeps the auth session in
   AsyncStorage. Needs a chunking SecureStore adapter (SecureStore caps around 2048 bytes).
10. **`revokePushToken` is unwired** — no sign-out flow exists to call it from.
11. **Ownership transfer does not exist**, so the last owner of a household holding pets
    cannot leave it at all (`leave_household` refuses rather than strand the pets). BE-4.
12. **No screen removes a member**, so an owner cannot revoke a co-owner or walker early.
    BE-4.
13. **No schema home** for `pet_weights` or `appointments.recurrence_months`.

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

### BE-4 — calibration, correctness and sharing
- **Push bodies render UTC.** One-line class of bug, but it is on every push a user reads.
  Plumb `households.timezone` into the due queries; `formatLocal()` must stop using
  `getUTCHours`. **Do this before the device test, or the first real push will look broken.**
- **`recalibrate` — the cron already calls it and it does not exist.** EWMA over a 14-day
  window, 30/70 blend with the current hold, `consecutive_no_count ≥ 3` → +0.5h.
  Until this lands, hold times never adapt: a 4h pet stays 4h forever. `0017` is what makes
  its input trustworthy — `consecutive_no_count` was writable by strangers until now.
- **Ownership transfer**, so the last owner of a household holding pets can leave at all
- **Remove-a-member**, so an owner can revoke a co-owner or walker before their window ends
- Decide what `get_my_data` should scope to, then make it say so
- Invite deep links (`pawclock.app/join/CODE`), Apple/Google `linkIdentity`
- `delete-account`, med escalation, vaccine recurrence, weekly digest + `daily_pet_stats`

### SYNC 3 — finish the sync seam
Realtime itself landed in [#24](https://github.com/pesrinadh-art/PetClock/pull/24):
`createSyncedRepos` now opens one `postgres_changes` channel per household and notifies all
collections on `SUBSCRIBED`, which closes the INSERT-between-subscribe-and-pull window.
What is left is `pull_changes` itself — it has **no LIMIT**, and its cursor uses `now()`
(transaction start), so a write committing after that snapshot but stamped earlier is
skipped permanently.

### BE-5 — hardening and launch
- Wire `app.check_rate_limit` into every Edge Function
- Turn on Supabase's anonymous sign-in rate limit / CAPTCHA — `0017` caps households per
  user, but nothing caps users, and that ceiling lives in the dashboard
- Widen the invite code alphabet to the documented base32, or fix the comment
- SecureStore chunking adapter for the auth session (`lib/db/client.ts:46`)
- Sentry, GitHub Actions (`db lint` + tests on PR, `db push` + `functions deploy` on merge)
- Store review prep
