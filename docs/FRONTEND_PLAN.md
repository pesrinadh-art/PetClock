# PawClock — Frontend Audit & End-to-End Implementation Plan

**Prepared by:** Sr. Frontend Engineer review (2026-07-23)
**Stack:** Expo SDK 57 · expo-router ~57 · React 19.2 · RN 0.86 · TypeScript · react-native-web
**Owner:** FE dev · **Track:** independent — see [`PLAN.md`](../PLAN.md) §4 for how this
runs in parallel with [`BACKEND_PLAN.md`](BACKEND_PLAN.md) and where the two
tracks meet (SYNC 1–4)

Every milestone below (FE-1 → FE-5) needs nothing from the backend to build
or verify — it's buildable against the local repo interface (§4) and
demoable on a dev-build phone with zero Supabase project in existence. The
data-model shapes in §1 and the notification contract in §2 are the frozen
handoff — the BE track builds its Postgres columns and push payloads to the
exact same shapes, so integration at the sync points is wiring, not rework.

---

## 0. Architecture as found (baseline)

| Layer | Files | State today |
|---|---|---|
| Root | `app/_layout.tsx` | Font loading, 3 nested context providers, `AutoCalibrator`, web `PhoneFrame`, Stack with 2 modals. No linking config, no notification wiring, no error boundary, no splash gating beyond fonts. |
| Tabs | `app/(tabs)/_layout.tsx` | 4 tabs + hardcoded center FAB that always opens `/add-appointment`. |
| Screens | `app/(tabs)/index.tsx`, `food.tsx`, `appointments.tsx`, `pets.tsx`; modals `app/add-pet.tsx`, `app/add-appointment.tsx` | All read/write in-memory contexts seeded from `data/mockData.ts`. Nothing survives a reload. |
| State | `context/PetsContext.tsx`, `LogsContext.tsx`, `AppointmentsContext.tsx` | Plain `useState` seeded from mock data; no persistence, no loading state, no repository abstraction. |
| Domain | `lib/petSchedule.ts` (status/calibration/inference/upcoming), `lib/appointmentUtils.ts` | Pure functions, good foundation for notification scheduling — predictions already exist (`getUpcomingForPet`). |
| Components | 17 files in `components/` | Presentational, mostly stateless; two hold local state that should be global (`AppointmentCard`, `MealTimeBanner`). |

The core insight for the flagship feature: **`getUpcomingForPet()` in `lib/petSchedule.ts:127-161` already computes the predicted pee/poo break window** (`predicted = lastLog.timestamp + holdHours`, ±buffer from `bufferMsFor`). The notification system is "just" a mirror of this pure function into `expo-notifications` scheduled triggers, re-reconciled after every log.

---

## 1. Defect register (fix before/alongside feature work)

### 1.1 Stale computed values / time bugs

- **D1 — Frozen appointment countdowns.** `Appointment.countdown` is *stored data*, computed once at creation (`context/AppointmentsContext.tsx:36-47`) and hardcoded in seeds (`data/mockData.ts:135,146,155` — "In 2 days" forever). Fix: delete `countdown` from the `Appointment` type; compute at render via `computeCountdown(parseAppointmentDateTime(a.date, a.time))` inside `AppointmentCard` and the stats memo in `appointments.tsx:26-43`. Store `dateTime: number | null` (epoch) instead of display strings (see D3).
- **D2 — UI never re-renders as time passes.** `index.tsx:19` (via children), `food.tsx:19`, `MealTimeBanner.tsx:21`, `UpcomingSection.tsx:31`, `PetCard.tsx:12` all call `new Date()` during render with nothing scheduling a re-render. A meal becoming due, a "~25 min" label, "Next Break 2h" — all freeze until an unrelated state change. Fix: add `hooks/useNow.ts`:
  ```ts
  export function useNow(intervalMs = 30_000): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
      const id = setInterval(() => setNow(new Date()), intervalMs);
      const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(new Date()));
      return () => { clearInterval(id); sub.remove(); };
    }, [intervalMs]);
    return now;
  }
  ```
  Consume it in `MealTimeBanner`, `UpcomingSection`, `PetCard`, `food.tsx`, `appointments.tsx` (pass `now` down as prop where components are pure).
- **D3 — Dates stored as display strings.** `Appointment.date` is `"Fri, Jul 4"` (no year) — `new Date("Fri, Jul 4 10:00 AM")` parses to **year 2001**, so seed a1 sorts/counts as 25 years overdue; `"Was Jun 20"` (`mockData.ts:154`) is unparseable and sorts to `Infinity` (`AppointmentsContext.tsx:26-28`). Fix: model change — `Appointment.dateTime: number` (epoch ms) + optional `hasTime: boolean`; keep display formatting in the view. `parseAppointmentDateTime` becomes a formatter's inverse used only at the form boundary.
- **D4 — "Missed" meals silently marked done.** `getTodaysMeals` (`lib/petSchedule.ts:242-243`): `status: timePassed || loggedCovered ? 'done' : 'upcoming'` — a meal whose time passed *without a food log* shows "✓ Done" on the Food screen. Fix: three-state `'done' | 'due' | 'upcoming'` where `done` requires `loggedCovered`, `due` = time passed and not covered; `ScheduleRow` renders `due` with the accent color and a one-tap "Log now" affordance.
- **D5 — Log `sub: 'Logged just now'` frozen forever.** `app/(tabs)/index.tsx:28` and `MealTimeBanner.tsx:30` store the literal string. Fix: drop `sub` from stored logs (or store a `source: 'manual' | 'notification' | 'banner'` enum); render relative time from `timestamp` in `Timeline`.
- **D6 — "Today's Log" shows all history.** `index.tsx:47` passes `getLogsForPet(activePet.id)` (all logs ever) under the header "Today's Log". After midnight yesterday's entries remain. Fix: filter `l.timestamp >= startOfDay(now)` in the screen; full history moves to the new Log History screen (§5).
- **D7 — No overdue signal for potty.** `nextRepeating` (`petSchedule.ts:100-107`) rolls a missed prediction forward by whole intervals, so a pee that's 20 minutes past predicted shows as "due in 3h40m" instead of "overdue". Fix: return `{ predicted, overdueBy }`; `UpcomingItem` gains `kind: 'upcoming' | 'due' | 'overdue'`; `RemindersStrip` renders overdue cards with `#C0392B` accent and pulsing "Now" label.
- **D8 — Feed-time inference can double-count meals.** `inferFeedTimes` (`petSchedule.ts:291-300`) takes the last 3 food logs across *days*, so a 2-meal/day pet gets 3 inferred feed times (yesterday's dinner + today's two). Fix: group food logs by time-of-day bucket (±60 min), take median per bucket, cap at buckets whose count ≥ 2 days observed.

### 1.2 Lost state / orphaned data

- **D9 — Reminder toggle is throwaway local state.** `AppointmentCard.tsx:25` `useState(!!appt.reminderEnabled)` — flipping the toggle never writes to `AppointmentsContext`; it resets on scroll/unmount. Fix: add `updateAppointment(id, patch)` to the context; card calls `updateAppointment(appt.id, { reminderEnabled: next })`.
- **D10 — Orphaned logs on pet delete.** `PetsContext.removePet` (`PetsContext.tsx:67-75`) removes only the pet. `pets.tsx:51-52` dialog *promises* "This deletes their profile and log history" — logs are never deleted, and appointments referencing the pet survive. Fix: cross-context cascade — add `removeLogsForPet(petId)` to `LogsContext` and `detachPetFromAppointments(petId)` to `AppointmentsContext`; orchestrate in a `useDeletePet()` hook (or, cleaner, in the repository layer §4 where a single `deletePet` transaction touches all three stores). Also cancel all scheduled notifications for that pet (§2.6).
- **D11 — Appointments reference pets by display string.** `Appointment.petNames: string[]` stores `"🐶 Mochi"` (`mockData.ts:117`, built in `add-appointment.tsx:48`). Renaming a pet breaks the link; per-pet filtering is impossible. Fix: `petIds: string[]`; resolve names/avatars at render from `usePets()`.
- **D12 — `removePet` reads stale closure state.** `PetsContext.tsx:68,71` uses render-scoped `pets` inside the callback (`pets.length <= 1`, fallback `pets.find`). Two rapid deletes race. Fix: do the check and fallback selection inside the functional `setPets((prev) => ...)` update.
- **D13 — MealTimeBanner snooze resets on unmount.** `MealTimeBanner.tsx:19` snooze map is component state — switch pets or tabs and the snooze is forgotten, the banner nags again. Fix: move snoozes into the new `NudgesContext` (§2.5) keyed `${petId}:${slotId}`, persisted with the rest of state.

### 1.3 Dead / non-functional UI

- **D14 — Notification toggles are decoration.** `add-appointment.tsx:22,34-42,57`: four toggles ("1 week before", …, "Set recurring reminder") collapse into a single `reminderEnabled: notifs.some(Boolean)` boolean; nothing is ever scheduled. Fix in §2.7: store `reminderOffsets: number[]` (minutes-before) and schedule real notifications; delete "Set recurring reminder" or implement recurrence — don't ship a lying toggle.
- **D15 — Overdue "Reschedule" button is a no-op.** `AppointmentCard.tsx:58-61` — `Pressable` with no `onPress`. Fix: `onPress={() => router.push({ pathname: '/add-appointment', params: { apptId: appt.id } })}` once edit mode exists (D16).
- **D16 — No edit or delete UI for appointments.** `removeAppointment` exists (`AppointmentsContext.tsx:53-55`) but nothing calls it; cards aren't tappable; no edit screen. Fix: (a) make `AppointmentCard` body a `Pressable` opening `/add-appointment?apptId=…` (form already has the edit pattern from `add-pet.tsx:22-24` to copy); (b) swipe-left to delete via `ReanimatedSwipeable` (react-native-gesture-handler) with undo snackbar (§3.4); (c) mark-as-done action for past appointments instead of leaving them "Overdue!" forever.
- **D17 — Timeline rows not tappable; no log undo/edit/delete.** `Timeline.tsx:16-27` renders inert `View`s. A mis-tap of 💧 on Home is permanent (`index.tsx:25-29` logs instantly). Fix: `LogsContext` gains `removeLog(id)` and `updateLog(id, patch)`; Timeline rows become pressable → bottom sheet with "Adjust time" (TimePickerField) / "Delete"; every quick-log shows an undo snackbar (§3.4).
- **D18 — Bell icon is fake.** `TopNavBar.tsx:11-14` — static bell with a hardcoded red dot, not pressable. Fix: make it a `Pressable` → `/notifications` (Notification Center screen §5.5); dot binds to `useNudges().pending.length > 0`.
- **D19 — FAB is context-blind.** `(tabs)/_layout.tsx:65-89` always pushes `/add-appointment`, even on the Pets tab. Fix: read the active route via `useSegments()`; on `pets` push `/add-pet`, on `index` open a small quick-log action sheet (💧/💩/🍽️), else `/add-appointment`.
- **D20 — TimePickerField can't be cleared.** Once a feed-time slot (`add-pet.tsx:130-140`) has a value there is no way to empty it (removing meal 3 of 3 is impossible). Fix: add a "Clear" row at the top of the modal list in `TimePickerField.tsx` calling `onChange('')`; same for `DatePickerField`.
- **D21 — Fixed 4 feed slots.** `add-pet.tsx:30-33` hardcodes `[0,1,2,3]`. Fix: dynamic list like the medications rows (add/remove), max ~6.

### 1.4 Forms & platform hygiene

- **D22 — No keyboard handling in either modal.** `add-pet.tsx:83-84` and `add-appointment.tsx:63-64`: no `KeyboardAvoidingView`, no `keyboardShouldPersistTaps="handled"` (Save needs two taps with keyboard open), no `returnKeyType`/`onSubmitEditing` chaining, Notes isn't `multiline`. Fix: wrap both in `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>`, set `keyboardShouldPersistTaps="handled"` on the ScrollViews, add `automaticallyAdjustKeyboardInsets` on iOS.
- **D23 — No validation feedback.** Save is silently disabled (`add-pet.tsx:40`, `add-appointment.tsx:44`); numeric hold-hours accept `"abc"` and silently become `null` (`add-pet.tsx:60-69`). Fix: inline error text under fields + haptic on invalid save attempt; clamp hold hours to 0.5–24.
- **D24 — Past dates allowed for appointments** (`DatePickerField.tsx:104-120` has no min date) — a new appointment can be born "Overdue!". Fix: `minDate` prop, dim/disable earlier cells.
- **D25 — Zero accessibility props.** No `accessibilityRole="button"`, `accessibilityLabel`, or `accessibilityState` on any `Pressable`/`Toggle` in the codebase (`Toggle.tsx:24`, `LogButtons.tsx:52`, `PetSwitcher.tsx:24`, etc.). Fix: sweep all interactive components; `Toggle` gets `accessibilityRole="switch"`, `accessibilityState={{ checked: on }}`.
- **D26 — Modals escape the web PhoneFrame.** All RN `Modal`s (`pets.tsx`, `TimePickerField`, `DatePickerField`) portal to the window root, ignoring the 390×844 frame in `_layout.tsx:22-45`. Fix (web-only polish): swap RN `Modal` for an absolutely-positioned overlay inside the frame on `Platform.OS === 'web'`, or accept and document.
- **D27 — `activePet` can be `undefined` but is typed `Pet`.** `PetsContext.tsx:44` `pets.find(...) ?? pets[0]` — with an empty array (fresh install after onboarding removes seeds, §4) this is `undefined` and every screen crashes. `add-appointment.tsx:28` `useState([pets[0].id])` likewise. Fix: type `activePet: Pet | null`, add an empty state on Home ("Add your first pet") and guard the appointment form.
- **D28 — Context functions unmemoized.** All three contexts recreate `addLog`/`addPet`/etc. every provider render, while `useMemo` deps omit them (`PetsContext.tsx:87-90`, `LogsContext.tsx:42`, `AppointmentsContext.tsx:57`) — works today only by accident, and `AutoCalibrator.tsx:35` lists them in its effect deps, re-running the effect on every render of the provider. Fix: wrap all mutators in `useCallback`; give `getLogsForPet` a memoized `Map<petId, TimelineEntry[]>` index so it stops allocating a new array per call.

---

## 2. Flagship feature — actionable potty notifications

> "Send actionable notifications (in-app + push) with Yes/No buttons at the predicted break time, so one tap logs it."

### 2.0 Delivery constraints (be honest with the PO)

- Local scheduled notifications with action buttons work fully in a **development build / production build**. Expo Go on Android no longer supports `expo-notifications` (removed SDK 53+); iOS Expo Go is limited. Plan assumes dev builds via `npx expo run:ios|android` or EAS Dev Client. Web: no scheduled notifications; the in-app banner (§2.5) is the only channel — feature-detect with `Platform.OS === 'web'`.
- "Push" here means *scheduled local notifications* (correct tool — predictions are computed on-device). Remote push (Expo Push Service) only becomes relevant with the sync backend for multi-caregiver households; the category/response plumbing below is identical for both, so nothing is throwaway.

### 2.1 New files

```
lib/notifications/
  categories.ts        // category + action identifiers, setNotificationCategoryAsync
  scheduler.ts         // pure "desired notifications" computation + reconcile against OS
  responseHandler.ts   // maps a NotificationResponse -> domain mutation (headless-safe)
  permissions.ts       // request/track permission, channel setup (Android)
hooks/
  useNotificationObserver.ts   // wires listeners in _layout.tsx
components/
  NudgeBanner.tsx      // generalized in-app foreground banner (replaces MealTimeBanner)
  NudgeHost.tsx        // renders queue of active nudges above tab bar
context/NudgesContext.tsx      // pending nudges, snoozes, streaks
```

### 2.2 Categories & actions (`lib/notifications/categories.ts`)

```ts
import * as Notifications from 'expo-notifications';

export const CATEGORY = {
  pottyCheck: 'potty-check',      // Yes / No / Snooze
  mealCheck: 'meal-check',        // Fed / Snooze
  medCheck: 'med-check',          // Given / Snooze
  apptReminder: 'appt-reminder',  // no actions beyond tap-through
} as const;

export const ACTION = { yes: 'log-yes', no: 'log-no', snooze: 'snooze-30' } as const;

export async function registerNotificationCategories() {
  await Notifications.setNotificationCategoryAsync(CATEGORY.pottyCheck, [
    { identifier: ACTION.yes, buttonTitle: '✅ Yes, logged it',
      options: { opensAppToForeground: false } },           // one tap logs, app stays closed
    { identifier: ACTION.no,  buttonTitle: '❌ Not yet',
      options: { opensAppToForeground: false } },
    { identifier: ACTION.snooze, buttonTitle: '⏰ Ask in 30 min',
      options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(CATEGORY.mealCheck, [
    { identifier: ACTION.yes, buttonTitle: '✅ Done feeding', options: { opensAppToForeground: false } },
    { identifier: ACTION.snooze, buttonTitle: '⏰ 30 min', options: { opensAppToForeground: false } },
  ]);
  // med-check mirrors meal-check
}
```

Every scheduled notification carries a typed data payload — this is the contract between scheduler and handler:

```ts
export type NudgeKind = 'pee' | 'poo' | 'food' | 'medication' | 'appt';
export type NotificationPayload = {
  v: 1;
  kind: NudgeKind;
  petId: string;
  slotId?: string;            // meal slot / medication id / appointment id
  predictedAt: number;        // epoch ms of the predicted event
  url: string;                // pawclock:// deep link for tap-through
};
```

### 2.3 Declarative scheduler (`lib/notifications/scheduler.ts`)

Do **not** imperatively "schedule the next one" from call sites — that always drifts. Instead reconcile, exactly like React renders:

```ts
export type DesiredNotification = {
  key: string;                       // stable: `${petId}:${kind}:${slotId ?? 'next'}`
  fireAt: Date;
  title: string; body: string;
  categoryId: string;
  payload: NotificationPayload;
};

/** Pure. Mirrors lib/petSchedule.getUpcomingForPet + meds + appointments. */
export function computeDesiredNotifications(
  pets: Pet[], logs: TimelineEntry[], appts: Appointment[],
  prefs: NotificationPrefs, now: Date,
): DesiredNotification[];

/** Diffs desired vs Notifications.getAllScheduledNotificationsAsync()
 *  (matched by payload key stored in content.data), cancels stale, schedules missing.
 *  Uses trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireAt }. */
export async function reconcileNotifications(desired: DesiredNotification[]): Promise<void>;
```

Rules encoded in `computeDesiredNotifications`:
- Potty: fire at `predicted - buffer` (reuse `bufferMsFor` from `petSchedule.ts:110-113`), i.e. the start of the window already shown in `RemindersStrip`. Only the *next* occurrence per type per pet (one `pee`, one `poo`).
- Meals: one per remaining feed slot today at slot time. Meds: same. Appointments: one per enabled `reminderOffsets` entry (D14).
- Respect per-pet mute + global quiet hours from `SettingsContext` (§5.4). Snoozed nudge → `fireAt = snoozedUntil`.

**Trigger points** — a single effect component `components/NotificationSync.tsx` mounted in `app/_layout.tsx` (sibling of `AutoCalibrator`):

```ts
export function NotificationSync() {
  const { pets } = usePets(); const { logs } = useLogs();
  const { appointments } = useAppointments(); const { prefs } = useSettings();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const run = debounce(() =>
      reconcileNotifications(computeDesiredNotifications(pets, logs, appointments, prefs, new Date())), 500);
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [pets, logs, appointments, prefs]);
  return null;
}
```

This automatically satisfies "reschedule the next prediction after each log": a new pee log changes `logs` → effect reruns → desired pee notification moves to `lastLog + holdHours - buffer` → reconcile cancels the old one and schedules the new one.

### 2.4 Response handling — "Yes" logs without opening the app

**Key architectural move:** the mutation on notification response must not depend on React being mounted. That forces the storage-first design of §4: `responseHandler.ts` writes through the repository (AsyncStorage) directly; contexts re-hydrate.

```ts
// lib/notifications/responseHandler.ts
export async function handleNotificationResponse(resp: Notifications.NotificationResponse): Promise<void> {
  const data = resp.notification.request.content.data as NotificationPayload;
  if (data?.v !== 1) return;
  const dedupeKey = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
  if (await wasProcessed(dedupeKey)) return;         // AsyncStorage set of handled response ids

  switch (resp.actionIdentifier) {
    case ACTION.yes:
      await logsRepo.add({                            // §4 repository, no React involved
        petId: data.petId, type: data.kind as 'pee' | 'poo' | 'food',
        icon: ICON[data.kind], label: LABEL[data.kind],
        timestamp: Date.now(), source: 'notification',
      });
      await rescheduleAfterHeadlessLog(data);         // recompute + reconcile from repo snapshot
      break;
    case ACTION.no:
    case ACTION.snooze: {
      const mins = resp.actionIdentifier === ACTION.snooze ? 30 : 20;  // "No" = re-ask sooner
      await nudgesRepo.snooze(nudgeKey(data), Date.now() + mins * 60_000);
      await rescheduleAfterHeadlessLog(data);
      break;
    }
    default:                                          // body tap: DEFAULT action, opens app
      if (data.url) router.push(parsePawclockUrl(data.url));
  }
  await markProcessed(dedupeKey);
}
```

Wiring in `app/_layout.tsx` via `hooks/useNotificationObserver.ts`:

```ts
export function useNotificationObserver() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // Foreground: suppress the OS banner, we show NudgeBanner instead (§2.5)
        shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
      }),
    });
    registerNotificationCategories();

    // App was cold-launched by a response (Android action taps / body taps)
    Notifications.getLastNotificationResponseAsync().then((r) => r && handleNotificationResponse(r));
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);
}
```

Platform reality, encoded in the design:
- **iOS:** action with `opensAppToForeground: false` wakes the app in the background; the response listener runs, the repo write + reconcile complete without UI. This is the true "one tap logs it, phone stays in pocket" path.
- **Android:** action taps launch/resume the app headlessly; combined with `getLastNotificationResponseAsync` on cold start and the `wasProcessed` dedupe set, the log is recorded exactly once whether the JS runtime was alive or not.
- Because the write goes to AsyncStorage, when the user later opens the app the `LogsContext` hydration + an `AppState → rehydrate` listener (§4.3) shows the log already in the timeline. No special sync path.

### 2.5 In-app foreground banner (`NudgeBanner` + `NudgesContext`)

Foreground notifications show no OS banner (we suppress them above), so the app renders its own:

- **`context/NudgesContext.tsx`** — derives *active nudges* from the same prediction data, plus snoozes:
  ```ts
  export type Nudge = { key: string; kind: NudgeKind; petId: string; slotId?: string;
                        dueAt: number; title: string; body: string };
  type NudgesValue = {
    active: Nudge[];                                   // due now, not snoozed, not satisfied
    answerYes: (n: Nudge) => void;                     // addLog + haptic + undo snackbar
    answerNo: (n: Nudge) => void; snooze: (n: Nudge, mins?: number) => void;
    snoozes: Record<string, number>;                   // persisted (fixes D13)
  };
  ```
  `active` is computed with `useNow(30_000)` from `getUpcomingForPet`/`getTodaysMeals`/`getTodaysMedications` — meaning banners appear even if the OS notification was missed or permissions denied. The scheduled notification and the banner are two projections of one prediction.
- **`components/NudgeBanner.tsx`** — generalization of the existing `MealTimeBanner.tsx` (which is deleted): icon, title, body, Yes / Not yet / Snooze buttons, colored per kind (potty `colors.pee`, food `colors.food`, med `colors.medicine`). Slide-in via `Animated`.
- **`components/NudgeHost.tsx`** — mounted once in `(tabs)/_layout.tsx` above the tab bar; shows the top nudge for the *active pet* inline on Home (replacing `MealTimeBanner` in `index.tsx:37`) and as a floating banner on other tabs. Multiple nudges stack with a "+1 more" pill → Notification Center screen.
- Also mounted: `addNotificationReceivedListener` (foreground receipt) simply triggers a `NudgesContext` refresh — no duplicate source of truth.

### 2.6 Deep linking (`pawclock://`)

Scheme already registered (`app.json:6`). Add:
- URL grammar: `pawclock://pet/:petId` (pet detail), `pawclock://pet/:petId/log?type=pee&prefillTs=...` (opens Home with the quick-log sheet pre-armed), `pawclock://appointments/:id`, `pawclock://notifications`.
- Because expo-router auto-handles routes, notification payloads use `url: '/pet/mochi?nudge=pee'` style **router paths**, and `responseHandler` default-case calls `router.push(url)`. Cold-start handling is free via expo-router's linking integration.
- Pet delete (D10) also calls `scheduler.cancelForPet(petId)` → part of the repository cascade.

### 2.7 Appointment reminders (completes D14)

- `Appointment` gains `reminderOffsets: number[]` (minutes before; UI presets 10080 / 1440 / 120). `add-appointment.tsx` toggles map to this array; `computeDesiredNotifications` emits one `appt-reminder` per offset with `fireAt = dateTime - offset`.
- `AppointmentCard` toggle (D9) now toggles `reminderOffsets.length > 0` persistently via `updateAppointment`.

---

## 3. More proactive / friction-reduction features (same spirit)

### 3.1 Quick-log everywhere with smart defaults
- **Time-adjust chips on log:** the single most common correction is "actually it was 20 min ago." `LogButtons.tsx` gains a long-press: tap = log now (unchanged), long-press opens a mini sheet with `Now / 15m ago / 30m ago / 1h ago / Custom…` writing `timestamp: Date.now() - offset`. `LogsContext.addLog` already accepts `timestamp` (`LogsContext.tsx:10,25`) — zero context change.
- **"Both" button:** pee+poo usually happen on the same walk. Add a third combined button to `LogButtons` that writes two entries in one tap (`addLogs(petId, entries[])` batch method so undo reverts both).
- **Food quick-log on Food screen:** `ScheduleRow.tsx` gets `onLogNow?: () => void`; rows in `due` state (D4) render a "Log now" badge button, so feeding is logged from the Food tab without visiting Home.
- **Med logging:** currently meds can never be marked given. Add `type: 'medication'` to `TimelineEntry.type` union (`mockData.ts:89`), render in `Timeline`/`DOT_BG`, `getTodaysMedications` gains the same `logs` param + `due/done` semantics as meals, `ScheduleRow` "Log now" applies. Med nudges become answerable.

### 3.2 Context-aware FAB & quick actions
- FAB per-tab behavior (D19). On Home the FAB opens a radial/sheet quick-log (💧 💩 🍽️ 💊) — one tap from anywhere in the scroll.
- **Home-screen quick actions** (`expo-quick-actions` package, config plugin): long-press app icon → "Log pee — Mochi", "Log poo — Mochi" (active pet), "Add appointment". Handler in `_layout.tsx` uses the same `responseHandler` mutation path, so a log takes literally two gestures from the phone home screen.

### 3.3 Streaks & positive reinforcement
- `lib/streaks.ts`: `computeStreak(logs, pet, now): { days: number; todayComplete: boolean }` — a day counts if all meal slots were logged. Rendered as a 🔥 pill in `PetCard` stats row (swap the redundant "Hold Time" stat) and a subtle confetti/haptic (`expo-haptics` `notificationAsync(Success)`) when the last meal of the day is logged.
- Weekly summary card on the new Pet Detail screen (§5): average actual pee interval vs configured hold (surfaces calibration drift, feeds §3.5).

### 3.4 Undo snackbar (safety net that *enables* one-tap logging)
- `components/Snackbar.tsx` + `context/SnackbarContext.tsx` (host mounted in `(tabs)/_layout.tsx`): `showUndo(message, onUndo, ttlMs = 5000)`. Every quick-log path (LogButtons, NudgeBanner Yes, ScheduleRow Log-now, notification-originated logs surfaced on next foreground) shows "💧 Pee logged for Mochi — Undo". Undo calls `removeLog(id)` (D17). Also used for appointment deletes (soft delete window); keep the confirm modal only for pet delete since it cascades.

### 3.5 Continuous calibration (make `AutoCalibrator` ongoing)
- Today `AutoCalibrator.tsx:19` only fires in `needsInfo` (once, then never again). Add gentle drift correction: weekly, compare `averageIntervalHours` from the last 7 days to the stored hold; if it differs by >25%, enqueue a *suggestion nudge* ("Mochi's been averaging 3.5h between pees — update her 4h schedule?") with one-tap Apply / Dismiss via `NudgeBanner`. Never silently overwrite a user-entered schedule (only auto-apply when the previous value was itself inferred — add `scheduleSource: 'user' | 'inferred'` to `Pet`).

### 3.6 Widgets (stretch, M6)
- iOS Lock/Home widget ("Next break in 40m" + last log time) via `@bacons/apple-targets`; Android via `react-native-android-widget`. Both read a small JSON snapshot the app writes to shared storage on each reconcile. Interactive one-tap logging from a widget is iOS 17+ AppIntents — native-code effort beyond the RN layer; ship read-only widgets first.

### 3.7 Misc proactive touches
- **Pull-to-refresh** on Home re-runs `useNow` + reconcile.
- **Overdue potty escalation:** if a potty nudge is 2× buffer past predicted with no answer, send one follow-up notification (max 1) — configurable in Settings.
- **Appointment day-of banner:** `NudgesContext` emits an `appt` nudge on the day, with "Directions" (opens maps URL with `location`) — `AppointmentCard` detail row becomes tappable too.

---

## 4. Persistence layer & repository design

### 4.1 Packages & storage shape

`@react-native-async-storage/async-storage` (works on iOS/Android/web-localStorage — keeps react-native-web support). Single-key-per-domain, versioned envelope:

```ts
// lib/storage/persist.ts
export type Persisted<T> = { version: number; updatedAt: number; data: T };

export async function loadPersisted<T>(key: string, currentVersion: number,
  migrate: (from: number, raw: unknown) => T | null): Promise<T | null>;
export async function savePersisted<T>(key: string, version: number, data: T): Promise<void>;

export const STORAGE_KEYS = {
  pets: 'pawclock/pets/v', logs: 'pawclock/logs/v',
  appointments: 'pawclock/appointments/v', nudges: 'pawclock/nudges/v',
  settings: 'pawclock/settings/v', meta: 'pawclock/meta/v',   // processed notification ids, onboarding flag
} as const;
```

Migrations are pure `(fromVersion, raw) => T | null` chains (e.g. v1→v2: `petNames` → `petIds` on appointments, add `dateTime` epoch, add `scheduleSource`). Failed migration → return `null` → fall back to seed/empty and stash the corrupt blob under `pawclock/backup/<key>` for debugging.

### 4.2 Repository interface (the future backend seam)

```ts
// lib/repo/types.ts
export interface EntityRepo<T extends { id: string }> {
  list(): Promise<T[]>;
  upsert(item: T): Promise<T>;
  remove(id: string): Promise<void>;
  /** Fires after any mutation, incl. ones from outside React (notification handler). */
  subscribe(listener: () => void): () => void;
}
export interface PawclockRepos {
  pets: EntityRepo<Pet> & { deleteCascade(petId: string): Promise<void> };  // D10 lives here
  logs: EntityRepo<TimelineEntry> & { add(input: NewLogInput): Promise<TimelineEntry> };
  appointments: EntityRepo<Appointment>;
  meta: { get<K>(key: string): Promise<K | null>; set(key: string, v: unknown): Promise<void> };
}
// lib/repo/local.ts  -> AsyncStorage-backed impl (M2)
// lib/repo/synced.ts -> later: same interface, local write-through + background push/pull,
//                       items gain { updatedAt, deletedAt? } for LWW merge; contexts untouched.
export const repos: PawclockRepos = createLocalRepos();   // swap point, one line
```

Crucial property: `responseHandler.ts` (§2.4) imports `repos` directly — React-free. `subscribe` is what lets contexts pick up headless writes.

### 4.3 Context hydration pattern (all three contexts, identical shape)

```ts
export function LogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<TimelineEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let live = true;
    const pull = () => repos.logs.list().then((l) => live && setLogs(l));
    pull().finally(() => live && setHydrated(true));
    const unsub = repos.logs.subscribe(pull);                       // headless writes
    const app = AppState.addEventListener('change', (s) => s === 'active' && pull());
    return () => { live = false; unsub(); app.remove(); };
  }, []);

  const addLog = useCallback(async (petId: string, input: NewLog) => {
    const entry = buildEntry(petId, input);
    setLogs((prev) => [entry, ...prev]);          // optimistic
    try { await repos.logs.upsert(entry); }
    catch { setLogs((prev) => prev.filter((l) => l.id !== entry.id)); showError(); }
    return entry;                                  // caller uses id for Undo
  }, []);
  ...
}
```

- Root gating: `app/_layout.tsx` keeps the splash (`expo-splash-screen`, `SplashScreen.preventAutoHideAsync`) until `fontsLoaded && petsHydrated && logsHydrated && apptsHydrated`; expose a combined `useHydrated()` from a tiny `BootContext`.
- **Seed policy:** mock data moves behind first-run: `meta.get('seeded')` — if never seeded and user skips onboarding demo, start empty (which is why D27 must be fixed). A "Load demo data" button in Settings keeps the current showcase behavior.
- `time` display string is dropped from stored `TimelineEntry` (D5-adjacent) — derived at render.

---

## 5. New screens & navigation (expo-router)

```
app/
  _layout.tsx                  // + useNotificationObserver, NotificationSync, SnackbarHost,
                               //   NudgesProvider, SettingsProvider, splash gating, ErrorBoundary
  onboarding.tsx               // full-screen, shown when meta.onboarded !== true
  settings.tsx                 // presentation: 'modal'
  notifications.tsx            // Notification Center, presentation: 'modal'
  add-pet.tsx                  // (existing, gains photo picker + dynamic feed slots)
  add-appointment.tsx          // (existing, gains apptId edit mode + reminderOffsets)
  pet/
    [id].tsx                   // Pet Detail (push)
    [id]/history.tsx           // Log History (push)
  (tabs)/ ...                  // unchanged structure
```

1. **Onboarding (`app/onboarding.tsx`)** — 3 panes (pager): welcome → add first pet (embeds the add-pet form body, extracted to `components/PetForm.tsx` so modal and onboarding share it) → notification permission primer ("PawClock predicts potty breaks — allow notifications so one tap logs them") before calling `requestPermissionsAsync` (never cold-prompt). Sets `meta.onboarded`. Root layout redirects via `<Redirect href="/onboarding" />` when unset.
2. **Pet Detail (`app/pet/[id].tsx`)** — avatar/photo, status card, editable schedule summary (tap → `/add-pet?petId=`), calibration insight (§3.5), streak, last-7-days mini timeline, buttons: Log History, Delete (cascade). Entry points: `PetCard` becomes pressable (currently inert, `PetCard.tsx:29`), `PetListItem` row body becomes pressable (currently only ✏️/🗑️ are, `PetListItem.tsx:16-23`).
3. **Log History (`app/pet/[id]/history.tsx`)** — `SectionList` grouped by day, filter chips (💧💩🍽️💊🏥), rows tappable → edit/delete sheet (D17), infinite scroll from repo. Fixes D6 by giving the full history a home.
4. **Settings (`app/settings.tsx`)** — notification master toggle + per-kind toggles, quiet hours (two `TimePickerField`s), snooze duration, per-pet mute, "Load demo data", "Reset all data", version. Backed by new `context/SettingsContext.tsx` persisted like the others; `NotificationPrefs` type consumed by the scheduler.
5. **Notification Center (`app/notifications.tsx`)** — pending nudges (answerable with the same Yes/No/Snooze), recent auto-logged entries ("Logged from notification — 2:14 PM — Undo"), upcoming scheduled reminders (read from `getAllScheduledNotificationsAsync` for transparency/debugging). Entry: TopNavBar bell (D18).

---

## 6. npm packages (SDK-57-compatible installs)

Always via `npx expo install` so Expo resolves the SDK 57-pinned versions (per AGENTS.md, verify against https://docs.expo.dev/versions/v57.0.0/ during implementation):

```bash
# M1–M2 core
npx expo install @react-native-async-storage/async-storage expo-splash-screen
# M3 notifications
npx expo install expo-notifications expo-device expo-task-manager
# M4 UX
npx expo install expo-image-picker expo-haptics react-native-gesture-handler react-native-reanimated
# M5 quick actions (community, has config plugin)
npm install expo-quick-actions
# M6 widgets (stretch, native targets)
npm install @bacons/apple-targets react-native-android-widget
```

`app.json` additions: `plugins: [..., ["expo-notifications", { icon, color }], "expo-quick-actions"]`; Android notification channel ("Pet care nudges", high importance) created in `permissions.ts`; `ios.infoPlist.NSPhotoLibraryUsageDescription` for image picker. Notifications require a dev build: `npx expo run:ios` / `run:android` (or EAS dev client) replaces Expo Go for day-to-day dev from M3 on.

---

## 7. Per-screen / per-component change matrix

| File | Changes (defect / feature refs) |
|---|---|
| `app/_layout.tsx` | Splash gating on hydration; `useNotificationObserver`; mount `NotificationSync`, `SnackbarHost`; add `SettingsProvider`, `NudgesProvider`; ErrorBoundary; onboarding redirect |
| `app/(tabs)/_layout.tsx` | Context-aware FAB (D19); mount `NudgeHost` above tab bar |
| `app/(tabs)/index.tsx` | `useNow`; today-only timeline filter (D6); replace `MealTimeBanner` with `NudgeHost` inline slot; long-press time-adjust + "Both" via new `LogButtons` API; undo snackbar on log; empty-pets state (D27) |
| `app/(tabs)/food.tsx` | `useNow`; three-state meals (D4); `ScheduleRow` log-now wiring; med due/done + logging |
| `app/(tabs)/appointments.tsx` | Live countdown stats from `dateTime` (D1/D3); tappable cards → edit; swipe-delete + undo (D16); per-pet filter chip (enabled by D11) |
| `app/(tabs)/pets.tsx` | Rows tappable → Pet Detail; delete cascade + notification cancel (D10); soft-delete undo copy fix |
| `app/add-pet.tsx` | Extract `PetForm`; `KeyboardAvoidingView` + `keyboardShouldPersistTaps` (D22); dynamic feed slots (D21); validation (D23); photo via `expo-image-picker` (`avatar` becomes `emoji \| photoUri`); `scheduleSource` tagging (§3.5) |
| `app/add-appointment.tsx` | Edit mode via `apptId` param (D16); `reminderOffsets` real scheduling (D14/§2.7); store `petIds` + `dateTime` (D11/D3); keyboard (D22); min-date (D24); guard empty pets (D27) |
| `context/PetsContext.tsx` | Repo-backed hydration; `useCallback` mutators (D28); functional-update `removePet` (D12); `activePet: Pet \| null` (D27); `deleteCascade` |
| `context/LogsContext.tsx` | Repo-backed; `removeLog`/`updateLog`/batch `addLogs` (D17, §3.1); memoized per-pet index (D28); headless-write subscription (§4.3); `medication` log type |
| `context/AppointmentsContext.tsx` | Repo-backed; `updateAppointment` (D9); drop stored `countdown` (D1); `petIds`/`dateTime`/`reminderOffsets` model |
| `lib/petSchedule.ts` | Overdue-aware `nextRepeating` (D7); 3-state meal/med status (D4); bucketized `inferFeedTimes` (D8); export `predictNextPotty(pet, logs, type)` for scheduler reuse |
| `lib/appointmentUtils.ts` | Operate on epoch `dateTime`; formatters only at view edge (D3) |
| `components/MealTimeBanner.tsx` | **Deleted** — superseded by `NudgeBanner`/`NudgeHost` (D13, §2.5) |
| `components/AutoCalibrator.tsx` | Becomes suggestion-based continuous calibrator (§3.5); effect-dep hygiene (D28) |
| `components/LogButtons.tsx` | Long-press offsets, "Both" button, haptics, a11y (§3.1, D25) |
| `components/Timeline.tsx` | Pressable rows → edit/delete sheet; relative-time subtitle; `source` badge for notification-logged entries (D17, D5) |
| `components/AppointmentCard.tsx` | Remove local toggle state (D9); live countdown (D1); pressable body; working Reschedule (D15); resolve pets from `petIds` (D11) |
| `components/ScheduleRow.tsx` | `due` state + `onLogNow` (D4, §3.1) |
| `components/PetCard.tsx` | Pressable → Pet Detail; streak stat (§3.3); `useNow`-driven Next Break |
| `components/PetListItem.tsx` | Row body pressable; a11y (D25) |
| `components/RemindersStrip.tsx` | Overdue styling (D7); cards tappable → answer nudge |
| `components/TopNavBar.tsx` | Bell pressable → `/notifications`; live badge (D18); settings gear |
| `components/TimePickerField.tsx` / `DatePickerField.tsx` | Clear option (D20); `minDate` (D24); web-frame overlay variant (D26) |
| `components/Toggle.tsx` | `accessibilityRole="switch"` etc. (D25) |
| New | `NudgeBanner`, `NudgeHost`, `Snackbar`, `PetForm`, `NotificationSync`, `EmptyState`; `hooks/useNow`, `hooks/useNotificationObserver`; `lib/notifications/*`, `lib/repo/*`, `lib/storage/persist.ts`, `lib/streaks.ts`; `context/NudgesContext`, `SettingsContext`, `SnackbarContext` |

---

## 8. Milestones

Estimates are focused engineering days for one FE dev; QA overlap included at
~20%. Numbered `FE-#` to match the track naming in `PLAN.md` §4 — every one
of these ships with **zero backend dependency**; the three sync points where
this track's output gets wired to the live backend are listed separately
below and tracked in `PLAN.md`, not here.

| # | Milestone | Contents | Days | Needs BE? |
|---|---|---|---|---|
| **FE-1** | Data model & defect burn-down | Model changes (`petIds`, epoch `dateTime`, drop stored `countdown`/`sub`, `medication` log type) · D1–D9, D12, D15–D17 (context APIs + tappable rows + edit-appointment mode) · D22–D25 forms/a11y · `useNow` · D20/D21 picker fixes. Exit: app is correct and fully editable, still in-memory. | 5 | No |
| **FE-2** | Persistence & repository | `persist.ts` + versioned envelopes + migration harness · `lib/repo/local.ts` · hydrate all three contexts + `SettingsContext` · splash gating · seed policy + D27 empty states · pet delete cascade (D10). Exit: state survives restart; repo seam in place. *(depends FE-1)* | 4 | No |
| **FE-3** 🚩 | Actionable notifications | Dev-build setup · categories/permissions/channels · `computeDesiredNotifications` + reconcile + `NotificationSync` · `responseHandler` with dedupe + headless reschedule · deep links · `NudgesContext` + `NudgeBanner`/`NudgeHost` (retire `MealTimeBanner`) · appointment reminders (D14) · Notification Center screen. Exit: predicted-time Yes/No/Snooze notifications that log with one tap, app closed; in-app banners when foregrounded; next prediction reschedules after every log — **all local, all offline.** *(depends FE-2)* | 6 | No |
| **FE-4** | Friction-reduction UX | Undo snackbar system · long-press offsets + "Both" · ScheduleRow log-now + med logging · swipe-to-delete appointments · context-aware FAB · haptics · streaks in `PetCard`. *(depends FE-2; parallelizable with FE-3)* | 4 | No |
| **FE-5** | New screens & onboarding | `PetForm` extraction + photo picker · Pet Detail · Log History · Settings (quiet hours feed FE-3 scheduler) · Onboarding flow · continuous calibration suggestions (§3.5). *(depends FE-2; permission primer depends FE-3)* | 5 | No |

**FE-1 → FE-5 subtotal: 24 focused days**, fully independent of the backend
track. FE-1→FE-2→FE-3 critical path ≈ 15 days to a demoable flagship
feature; FE-4 runs in parallel with FE-3 after FE-2 lands.

### Where this track meets the backend (see `PLAN.md` §4 for full detail)

| Sync | Trigger | FE-side work | Days |
|---|---|---|---|
| **SYNC 1** | Backend ships schema + auth | Swap `lib/repo/local.ts` for the Supabase-backed repo; wire anonymous sign-in | 4 |
| **SYNC 2** | Backend ships the push dispatcher | Point `responseHandler.ts` at `log-action` instead of local storage; register push tokens | 2 |
| **SYNC 3** | Backend ships invite RPCs | Build household/sharing UI (invite screen, member list, settings) | 3 |
| **SYNC 4** | Both tracks substantially done | Joint two-device QA + hardening, with the BE dev | 4–5 |

**Stretch (post-sync, optional):** `lib/repo/synced.ts` refinements beyond
what SYNC 1 requires (tombstone/LWW polish), `expo-quick-actions`, read-only
widgets — pick up if time remains after SYNC 4.
