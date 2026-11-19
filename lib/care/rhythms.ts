/**
 * rhythmsForPet(pet) — the one adapter that knows where the Phase 2 interval settings live
 * (docs/CARE_MODULES_PLAN.md, 0021_care_config.sql). Today they are typed columns on `pets`
 * (`walk_interval_hours`, `habitat_interval_days`); if they ever move to a child table only
 * this file changes.
 *
 * An unset value (null, or absent on a row written before 0021 / an older local build) reads
 * as the default, so a pet that opted into walks or habitat cleaning always has a usable
 * interval. Out-of-range values are clamped to the same ranges the DB CHECKs enforce.
 *
 * Deliberately imports nothing from ./species or ./registry: modules import this file, and
 * species.ts imports the registry, so a dependency here would be an import cycle. The species'
 * suggested cleaning interval is passed in (callers have it on the snapshot's profile).
 */
import type { Pet } from '../db/models';
import type { SpeciesProfile } from './types';

/** Walks: "every N hours since the last walk". */
export const DEFAULT_WALK_INTERVAL_HOURS = 4;
export const WALK_INTERVAL_MIN_HOURS = 0.5;
export const WALK_INTERVAL_MAX_HOURS = 24;

/** Habitat cleaning: "due every N days", when neither the pet nor its species says otherwise. */
export const DEFAULT_HABITAT_INTERVAL_DAYS = 7;
export const HABITAT_INTERVAL_MIN_DAYS = 1;
export const HABITAT_INTERVAL_MAX_DAYS = 90;

/** Habitat reminders fire at this household-local wall clock on the due date (PO decision 4). */
export const HABITAT_REMINDER_LOCAL_TIME = '10:00';

export type PetRhythms = { walkIntervalHours: number; habitatIntervalDays: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A species profile's suggested cleaning interval, else the default. */
export function suggestedHabitatDaysOf(profile?: Pick<SpeciesProfile, 'habitatIntervalDays'> | null): number {
  return profile?.habitatIntervalDays ?? DEFAULT_HABITAT_INTERVAL_DAYS;
}

/**
 * The pet's intervals. `profile` is its species profile (CareSnapshot.profile), whose
 * suggested cleaning interval applies while the pet has none of its own.
 */
export function rhythmsForPet(
  pet: Pick<Pet, 'walkIntervalHours' | 'habitatIntervalDays'>,
  profile?: Pick<SpeciesProfile, 'habitatIntervalDays'> | null,
): PetRhythms {
  const walk = pet.walkIntervalHours;
  const days = pet.habitatIntervalDays;
  return {
    walkIntervalHours:
      typeof walk === 'number' && Number.isFinite(walk) && walk > 0
        ? clamp(walk, WALK_INTERVAL_MIN_HOURS, WALK_INTERVAL_MAX_HOURS)
        : DEFAULT_WALK_INTERVAL_HOURS,
    habitatIntervalDays:
      typeof days === 'number' && Number.isFinite(days) && days > 0
        ? clamp(Math.round(days), HABITAT_INTERVAL_MIN_DAYS, HABITAT_INTERVAL_MAX_DAYS)
        : suggestedHabitatDaysOf(profile),
  };
}
