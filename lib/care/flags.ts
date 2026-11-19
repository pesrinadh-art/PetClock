/**
 * Care-module feature flags (docs/CARE_MODULES_PLAN.md, Phase 2: "local reminders behind a
 * care.rhythms flag").
 *
 * CARE_RHYTHMS gates the LOCAL reminders of the Phase 2 modules (walks, habitat cleaning). Off,
 * those modules still show their Upcoming rows, hero and quick log; they just schedule no
 * notification. It does not touch potty, meals, meds or visits.
 *
 * In local mode each caregiver's device schedules its own, and a log from either one syncs and
 * reschedules both. Once server pushes are active (lib/push/mode.ts) the backend sends the
 * Phase 3 `care_due` push instead and these local reminders stand down (localReminder.ts),
 * whatever this flag says.
 */
export const CARE_RHYTHMS = true;
