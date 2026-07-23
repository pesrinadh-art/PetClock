# PawClock — Master End-to-End Plan (Frontend × Backend)

This is the unified roadmap synthesized from two specialist reviews:
- **[docs/FRONTEND_PLAN.md](docs/FRONTEND_PLAN.md)** — 28-defect register (D1–D28), actionable-notification client design, persistence/repo layer, new screens, per-component change matrix, 6 milestones (~29 days)
- **[docs/BACKEND_PLAN.md](docs/BACKEND_PLAN.md)** — Supabase decision, full Postgres DDL + RLS + triggers, push/prediction pipeline, offline-first sync, auth/households, 7 milestones (~28 days)

Read those for detail. This file reconciles them into one build order and one contract.

---

## 1. Two developers, two independent tracks

You're not shipping until everything is ready, and you have a dedicated FE dev
and a dedicated BE dev — so the plan changes from "ship local, add backend
later" to **"both tracks start day 0 and run fully in parallel,"** meeting at
a small number of integration points.

This works because both specialist plans independently converged on the same
seam: a repository interface the FE contexts talk to, and a notification
contract (categories/payload/actions) that's identical whether the sender is
the OS or a Supabase Edge Function. Freeze that contract once (§2, below) and
neither dev blocks on the other's code — only on the other's *interfaces*,
which are already written down.

- **FE dev** builds the entire client — defect burn-down, local persistence,
  local actionable notifications, friction UX, new screens — against the
  agreed types and a local repo implementation. None of it requires a
  Supabase project to exist.
- **BE dev** builds the entire backend — schema, RLS, triggers, push
  dispatcher, sync infra, auth — and can verify every bit of it with
  `supabase db reset`, `psql`, `curl`, and pgTAP. None of it requires the RN
  app to exist.
- They meet at four integration points (§4) to wire the seams together —
  swap the local repo for the synced one, point the notification handler at
  the live endpoint, build the sharing UI against real invite RPCs, then a
  joint two-device QA pass before hardening.

Nothing either dev builds solo is throwaway: the FE's local notification
categories/payload/response-handler are exactly what the BE's push pipeline
targets — integration is wiring, not a rewrite.

---

## 2. Unified contracts (resolves divergence between the two plans)

The two engineers picked slightly different identifiers. Canonical versions —
put these in `shared/notificationContracts.ts`, imported by BOTH the client
scheduler and (later) the Supabase Edge Functions:

```ts
// Categories (client registers; server sets categoryId on push)
export const CATEGORY = {
  break: 'break-check',        // pee/poo — Yes / Not yet / Snooze
  meal:  'meal-check',         // Fed / Snooze
  med:   'med-check',          // Given / Snooze
  appt:  'appt-reminder',      // tap-through only
} as const;

// Actions (server's uppercase wins — it's also stored in the notifications table)
export type NudgeAction = 'LOG_YES' | 'LOG_NO' | 'SNOOZE';

// Snooze: default 30 min, "Not yet" re-asks in 20 min (Settings can override both)

// Payload — superset of both plans; `actionToken` absent in local mode
export type NotificationPayload = {
  v: 1;
  kind: 'pee' | 'poo' | 'food' | 'medication' | 'appt';
  petId: string;
  slotId?: string;             // feed_time / medication / appointment id
  predictedAt: string;         // ISO
  url: string;                 // expo-router path for tap-through
  notificationId?: string;     // server mode only
  actionToken?: string;        // server mode only (HS256 JWT)
};
```

**Storage reconciliation:** FE plan says AsyncStorage, BE plan says SQLite.
Resolution: AsyncStorage for the local-only phase (Repo v1 — simplest, works on
web); when sync lands, Repo v2 is `expo-sqlite` + outbox as specced in
BACKEND_PLAN §4. The `PawclockRepos` interface (FRONTEND_PLAN §4.2) is identical
either way — that's the swap point.

**ID reconciliation:** adopt **client-generated UUID v4 for all entities now**
(BE plan §0.9), even in the local-only phase — it makes every later sync replay
idempotent for free and kills the `Date.now()` collision bugs.

**Model reconciliation (do once, in FE M1, matching the future DB):**
- `Appointment`: `petIds: string[]`, `startsAt` epoch/ISO + `allDay`, `reminderOffsetsMinutes: number[]`; delete stored `countdown`
- `Pet`: `birthdate` replaces `age` string; drop `meta`; add `scheduleSource: 'user' | 'inferred'`
- `TimelineEntry` → `LogEntry`: keep `type/occurredAt/note/source`; drop stored `icon/label/time/sub`
- Add `'medication'` to log types

**This section is the Day 0 handoff.** Both devs read it, agree on it once,
and then work independently — the FE's local types and the BE's Postgres
columns are the same shapes by construction, so nothing drifts until an
integration point forces a real conversation.

---

## 3. Flagship feature — end-to-end wiring (both modes)

### Local mode (ships first)

```
lib/petSchedule.ts predicts break
        │
computeDesiredNotifications() ──► reconcileNotifications() ──► OS schedules
        ▲                                                        local notif
        │                                                            │ fires at predicted-buffer
   logs changed                                                      ▼
        │                                            ┌── user taps ✅ LOG_YES ──┐
        │                                            │ (opensAppToForeground:   │
        │                                            │  false — app stays shut) │
        │                                            ▼                          │
        └── repos.logs.add() ◄── responseHandler.ts (headless, React-free) ◄────┘
             │ (AsyncStorage write + subscribe() ping)
             └► contexts re-hydrate → Timeline shows entry → NotificationSync
                effect reruns → next prediction scheduled. Loop closed.
```

### Household mode (after Supabase phases)

```
log INSERT (any member, any path)
   └► trg_logs_after_insert ─► app.recompute_prediction() ─► prediction_state.notify_at
pg_cron (* * * * *) ─► dispatch-notifications Edge Fn
   ├─ idempotency: INSERT notifications(dedupe_key UNIQUE) — skip if 23505
   ├─ sign 3h HS256 actionToken {nid,pid,hid,breakType}
   └─ Expo Push API → ALL household members' devices (categoryId: 'break-check')
user taps ✅ on lock screen (app possibly killed)
   └► actionHandler → POST /functions/v1/log-action {actionToken, action, clientLogId}
        ├─ Gate 1: notifications.status 'sent'→'actioned' CAS  (partner race → benign replay)
        ├─ Gate 2: logs PK = clientLogId                        (network retry → no-op)
        └─ INSERT log → trigger re-predicts + supersedes sibling pushes
              └► Realtime channel → partner's open app updates live
```

The client-side pieces (categories, response handler, deep links, in-app
NudgeBanner) are **the same code** in both modes — mode only changes who
schedules (OS vs pg_cron) and where the write lands first (AsyncStorage vs Edge
Function).

### In-app (foreground) path — same spirit, no notification needed
`NudgesContext` computes due nudges from the same predictions every 30 s;
`NudgeBanner` renders Yes / Not yet / Snooze inline (replaces `MealTimeBanner`).
So the one-tap flow works even with permissions denied, on web, and in Expo Go.

---

## 4. Two parallel tracks + four sync points

Both devs start the day the §2 contract is agreed. Within a track, phases are
sequential (one dev, one thread of work); across tracks, nothing blocks until
a **SYNC** row — those are the only moments the two devs' work has to touch.

### 🔵 Frontend track — fully independent of Supabase existing

| # | Ships | Days | Needs BE? |
|---|---|---|---|
| FE-1 | Data-model fixes + defect burn-down D1–D28 | 5 | No |
| FE-2 | Local persistence: repo interface + AsyncStorage impl, hydration, cascade delete | 4 | No |
| FE-3 | 🚩 Actionable Yes/No notifications (local scheduler, categories, response handler, NudgeBanner) | 6 | No |
| FE-4 | Friction pack: undo snackbar, backdating, "Both" button, log-now, streaks | 4 | No |
| FE-5 | Onboarding, Settings, Pet Detail, Log History, photo picker | 5 | No |

**FE-1 → FE-5 subtotal: 24 days, zero backend dependency.** The FE dev can
build, demo, and ship-to-TestFlight a fully offline app on this track alone.

### 🟢 Backend track — fully independent of the RN app existing

| # | Ships | Days | Needs FE? |
|---|---|---|---|
| BE-1 | Supabase foundations: schema/RLS/triggers/RPCs, local Docker stack, seed parity, anonymous auth + household bootstrap | 7 | No |
| BE-2 | Offline sync infra: realtime publication config, replica identity, delta-pull support, tombstone design | 5 | No |
| BE-3 | 🚩 Server push loop: token table, pg_cron dispatcher, log-action with dual idempotency gates, receipts cron | 6 | No |
| BE-4 | Sharing & smarts: invite RPCs, Apple/Google linking config, server recalibration, med escalation, digest | 7 | No |
| BE-5 | Hardening: rate limiting, Sentry, staging environment, CI (`db push` + `functions deploy`) | 3 | No |

**BE-1 → BE-5 subtotal: 28 days, zero frontend dependency.** Every one of
these is verifiable with `supabase db reset`, `psql`, `curl`, and pgTAP —
the BE dev never needs the app running to know their work is correct.

### 🟡 Sync points — the only places the two devs coordinate

| Sync | Trigger | What happens | FE effort | Best timed |
|---|---|---|---|---|
| **SYNC 1** | BE-1 lands (schema + auth live) | FE swaps the local repo for the Supabase-backed one; wires anonymous auth | ~4 days | As soon as BE-1 ships (~day 7) — don't wait for FE-5; integrating the repo swap early de-risks it instead of doing a big-bang merge at the end |
| **SYNC 2** | BE-3 lands (push loop live) | FE points its *already-built* response handler at `log-action` instead of local storage; registers push tokens | ~2 days | Right after BE-3 ships (~day 18) — cheap because FE-3 already built to the shared contract |
| **SYNC 3** | BE-4 lands (invite RPCs live) | FE builds household/sharing UI (invite screen, member list, settings) against real RPCs | ~3 days | ~day 25 |
| **SYNC 4** | Both tracks substantially done | Joint two-device QA: full flagship scenario on two physical phones, one household — push fires, tap Yes, partner sees it live. Then joint hardening/store prep. | ~4–5 days, both devs | Final week |

### Calendar estimate

Running the two tracks in parallel with sync points interleaved (rather than
one dev doing ~52 days sequentially):

```
Day  0        7      15    18   22       28  30           35
 │   │        │       │     │    │        │   │             │
 FE  ├─FE-1─┼─FE-2─┼───FE-3───┼─FE-4─┼──FE-5──┤
 │            SYNC1(~4d)      SYNC2(~2d)   SYNC3(~3d)  SYNC4(~5d)
 BE  ├────BE-1────┼───BE-2───┼────BE-3────┼────BE-4────┼BE-5┤
```

**≈ 32–36 calendar days to "everything ready,"** versus ~52 person-days if
one person built both tracks in sequence — the parallelism doesn't fully
halve it (SYNC points force some serialization, and BE is the longer pole),
but it's close to a 35% reduction in wall-clock time to your ship gate.

Nothing here compresses scope — every defect, every table, every milestone
from the two specialist plans still ships. This only changes *who does what,
when*, so two people aren't waiting on each other.

---

## 5. Immediate next actions (this week)

1. **Contract kickoff (both devs, joint, ~1 day):** walk through §2 and §3
   of this file together. This is the only meeting required before both
   tracks run independently.
2. **FE dev** starts FE-1: model fixes (`petIds`, `startsAt`, UUID ids, drop
   stored `countdown`/`sub`) + defect burn-down. `npx expo install --check`
   first (1 outdated package, 5 min).
3. **BE dev** starts BE-1: `supabase init`, migrations from
   `docs/BACKEND_PLAN.md` §2, local Docker stack, seed parity.
4. Decision needed from you before FE-3 / BE-3: **dev build vs Expo Go.**
   Notifications require `npx expo run:ios|android` (or an EAS dev client) —
   Expo Go can't do them from SDK 53+. Get a dev-client build going during
   week 1 so it's not a surprise blocker at FE-3.
5. Put SYNC 1–4 on both devs' calendars now, even loosely — they're the
   only hard coordination cost in this plan, and knowing the dates in
   advance is what keeps them cheap.
