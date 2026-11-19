/**
 * Care-module feature flags (docs/CARE_MODULES_PLAN.md, Phase 2: "local reminders behind a
 * care.rhythms flag").
 *
 * CARE_RHYTHMS gates the LOCAL reminders of the Phase 2 modules (walks, habitat cleaning). Off,
 * those modules still show their Upcoming rows, hero and quick log; they just schedule no
 * notification. It does not touch potty, meals, meds or visits.
 *
 * Phase 2 reminders are local only: each caregiver's device schedules its own, and a log from
 * either one syncs and reschedules both. Server pushes (`care_due`) are Phase 3.
 */
export const CARE_RHYTHMS = true;
