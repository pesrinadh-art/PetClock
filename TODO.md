# PawClock — Development Roadmap

Current state: fully working UI prototype. All data is in-memory (React context seeded
from `data/mockData.ts`) — nothing survives an app restart. No auth, no notifications,
no backend. The to-dos below are ordered by what unblocks what.

---

## Phase 0 — Foundation (do this first, everything depends on it)

### Backend / Data layer
- [ ] **Persistence v1 (local):** add `@react-native-async-storage/async-storage`; hydrate
      Pets/Logs/Appointments contexts from storage on launch, write-through on every mutation.
      Ship this before any backend — it makes the app actually usable day-to-day.
- [ ] **Fix the data model before it hardens:**
  - [ ] Appointments store `petNames: string[]` (display strings like `"🐶 Mochi"`).
        Change to `petIds: string[]` and derive display names at render time —
        renaming/deleting a pet currently orphans its appointments silently.
  - [ ] `Appointment.countdown` is computed once at creation and stored
        (`AppointmentsContext.tsx`). It goes stale — "In 2 days" stays "In 2 days" forever.
        Store only date/time; compute countdown at render.
  - [ ] Dates/times are free-form strings (`"Fri, Jul 4"`, `"6:00 PM"`). Store ISO
        timestamps (epoch ms) as source of truth; format for display only.
        `parseAppointmentDateTime` relying on `new Date("Fri, Jul 4")` is fragile
        (no year, engine-dependent parsing).
  - [ ] `Pet.age` is a static string (`"2 yrs"`) — store `birthDate` and derive age.
- [ ] **Backend v1:** recommend Supabase (auth + Postgres + realtime in one) or Firebase.
      Tables: `users`, `households` (so two owners share one dog), `pets`, `logs`,
      `schedules`, `medications`, `appointments`, `reminder_settings`.
- [ ] **Auth:** email + Apple/Google sign-in. Gate sync behind it; keep local-only
      mode working (offline-first, sync when signed in).
- [ ] **Push notifications:** `expo-notifications`. This is the core product promise —
      the reminder toggles in Add Appointment currently do nothing. Local scheduled
      notifications first (meal times, med times, predicted pee/poo breaks, appt
      reminders), server push later.

### Engineering hygiene
- [ ] Unit tests for `lib/petSchedule.ts` (314 lines of scheduling math — parseClockTime,
      inferScheduleFromLogs, getTodaysMeals — all currently untested).
- [ ] EAS build config + app icons/splash review for a real device build.
- [ ] Update the 1 outdated package (`npx expo install --check`).

---

## Phase 1 — Per-page work

### 🏠 Home (`app/(tabs)/index.tsx`)
**Frontend**
- [ ] Undo/edit/delete a log entry (fat-finger a 💩 and it's permanent forever).
- [ ] Log food and medication from Home — `LogButtons` only does pee/poo, but meal
      "done" status is derived from food logs, so meals can never be marked done from Home.
- [ ] "Today's Log" only — add history view (yesterday, last 7 days) with day headers.
- [ ] Time-ago labels ("Logged just now") are frozen strings — recompute relative time.
- [ ] Empty state for a brand-new pet with zero logs.
- [ ] Optional: log with a custom time ("actually happened 20 min ago").

**Backend**
- [ ] Logs table with `pet_id`, `type`, `timestamp`, `note`; sync + offline queue.
- [ ] Schedule local notifications from predicted next pee/poo break.

### 🍽️ Food (`app/(tabs)/food.tsx`)
**Frontend**
- [ ] Tap a meal/med `ScheduleRow` to mark it done (creates a log) — currently rows are
      display-only and the only action is "Edit Meal Times" → full pet edit form.
- [ ] Per-meal detail: portion size, food brand/type.
- [ ] Medication "done today" tracking (med rows never show done state — there's no med log type).
- [ ] Add `medication` to `TimelineEntry.type` union so meds appear in Today's Log.

**Backend**
- [ ] Meal-completion + med-completion log types.
- [ ] Notification scheduling per feed time and per medication time.
- [ ] Streak/history stats ("fed on time 6/7 days this week").

### 📅 Appointments (`app/(tabs)/appointments.tsx` + `add-appointment.tsx`)
**Frontend**
- [ ] Edit appointment — `removeAppointment` exists in context but there is **no UI** for
      edit or delete; cards aren't tappable. Add detail view with edit/delete.
- [ ] Mark appointment complete → optionally log it (the mock "Vet Checkup ✓" timeline
      entry hints at this flow, but it doesn't exist).
- [ ] Past appointments section (history), not just "Upcoming".
- [ ] Filter by pet (currently only by type).
- [ ] Replace free-text date/time with real pickers storing timestamps
      (`DatePickerField`/`TimePickerField` exist — verify they output parseable values).
- [ ] Recurring appointments (monthly flea meds, annual vaccines).
- [ ] The notification checkboxes (`1 week before`, etc.) collapse to a single
      `reminderEnabled` boolean — persist the actual selections.

**Backend**
- [ ] Appointments table keyed by `pet_ids`, real timestamps, recurrence rule.
- [ ] Wire reminder selections to scheduled notifications.
- [ ] Vaccine records: store history + due-date computation (rabies every 1–3 yrs).
- [ ] Optional: device calendar integration (`expo-calendar`).

### 🐾 Pets (`app/(tabs)/pets.tsx` + `add-pet.tsx`)
**Frontend**
- [ ] Pet photo support (`expo-image-picker`) — emoji avatars are fine for v1 but photos
      are the #1 emotional feature of pet apps.
- [ ] Pet detail page: profile + weight history + vaccine records + notes (microchip,
      vet contact, insurance policy #).
- [ ] Weight tracking with a small chart.
- [ ] `add-pet` form polish: `KeyboardAvoidingView`, inline validation messages
      (currently the Save button just stays disabled with no explanation), birthdate
      picker instead of free-text age.
- [ ] Deleting a pet claims "deletes their profile and log history" — it doesn't; logs
      and appointments for that pet are left orphaned. Actually cascade the delete.

**Backend**
- [ ] Pets table + photo storage (Supabase Storage / S3).
- [ ] Household sharing: invite a partner, both log for the same pet, realtime sync
      (this is the killer feature for a potty-tracking app — two people, one dog).

### ⚙️ Missing pages to add
- [ ] **Settings screen:** units, notification preferences, household members, sign out,
      export data. (`TopNavBar` avatar button is currently decorative.)
- [ ] **Onboarding:** first-launch flow → create account (or skip) → add first pet →
      explain the 3-day calibration. Right now new users land on demo pets.
- [ ] Remove mock seed data once persistence lands (keep it behind a dev flag).

---

## Phase 2 — Differentiators (after the above)
- [ ] Smarter calibration: `inferScheduleFromLogs` runs once after 3 days; make it
      continuously refine hold-times as more logs accumulate.
- [ ] Walk tracking (duration/GPS optional).
- [ ] Widgets / lock-screen countdown ("next break in 40 min").
- [ ] **Pet Walker Mode:** a scoped, time-boxed household role for a dog walker /
      sitter (not a full co-owner). On accepting an invite, the walker's app shows
      just the pet(s) they're covering — last pee/poo time and note front and
      center — and a log-now action for pee/poo/food/meds. Logs the walker adds
      write to the same shared log stream, so they appear live on the owner's
      timeline and Home screen, same as a household member's log (realtime
      channel + `source: 'walker'` tag so the owner can see who logged what).
      Walker can log; can't edit the pet profile, schedule, or appointments.
      Access expires automatically at a set time/date. Builds on the
      `household_members` + `role`/`member_expires_at` design already sketched
      as "Pet-sitter mode" in `docs/BACKEND_PLAN.md` §9 — this note pins the
      exact UX: last-log visibility + one-tap logging + owner-visible sync.
- [ ] Vet visit prep: export recent logs as PDF for the vet.

---

## Suggested order of attack
1. AsyncStorage persistence + data-model fixes (petIds, timestamps, live countdowns)
2. Local notifications for meals/meds/appointments
3. Tap-to-complete meals/meds + log edit/delete
4. Appointment edit/delete/detail
5. Onboarding + remove mock data
6. Supabase auth + sync + household sharing
7. Photos, pet detail page, weight tracking
