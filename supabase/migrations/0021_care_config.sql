-- 0021_care_config.sql
-- Phase 2 of docs/CARE_MODULES_PLAN.md ("0021_care_config.sql").
--
-- Per-pet interval settings for the walks and habitat-cleaning modules, as typed columns on
-- `pets` (plan decision "Walk/habitat config storage": pets already has RLS, realtime and
-- pull_changes; a generic child table only when a third interval setting appears).
--
--   walk_interval_hours    "every N hours since the last walk" (product decision 1), 0.5–24,
--                          the same range and type as the potty hold hours.
--   habitat_interval_days  cleaning "due every N days" (date-based, product decision 4), 1–90.
--
-- Both are nullable with no default: null means "not set", and the app's rhythmsForPet
-- (lib/care/rhythms.ts) supplies the default. Existing rows gain nothing — walks and habitat
-- are opt-in and the 0019 backfill stays {potty,meals,meds,visits}.
--
-- No trigger change: neither column feeds app.recompute_prediction, so trg_pets_schedule_change
-- is untouched. Writes are covered by the existing pets_update policy (editors only, 0006).
-- Server pushes for these modules (care_state, recompute_care, care_due dispatch) are Phase 3.

alter table public.pets
  add column if not exists walk_interval_hours numeric(4,1)
    check (walk_interval_hours is null or walk_interval_hours between 0.5 and 24),
  add column if not exists habitat_interval_days smallint
    check (habitat_interval_days is null or habitat_interval_days between 1 and 90);
