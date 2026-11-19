/**
 * The PetWizard Routine step's walk / habitat interval fields (care modules Phase 2): parsing,
 * wording and the suggested values. Pure (no React), and under components/care/** because the
 * habitat noun and the suggested interval come from the species table — screens never read a
 * pet's species themselves.
 *
 * A blank field saves null ("not set"); the modules then use rhythmsForPet's default, so a blank
 * is always safe.
 */
import type { Species } from '../../lib/db/models';
import {
  DEFAULT_WALK_INTERVAL_HOURS,
  HABITAT_INTERVAL_MAX_DAYS,
  HABITAT_INTERVAL_MIN_DAYS,
  suggestedHabitatDaysOf,
  WALK_INTERVAL_MAX_HOURS,
  WALK_INTERVAL_MIN_HOURS,
} from '../../lib/care/rhythms';
import { speciesProfile } from '../../lib/care/species';

export type ParsedInterval = { value: number | null; error?: string };

/** Optional "every N hours" walk interval: blank → null; else a number clamped to 0.5–24. */
export function parseWalkIntervalHours(raw: string): ParsedInterval {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: null, error: `Enter a number between ${WALK_INTERVAL_MIN_HOURS} and ${WALK_INTERVAL_MAX_HOURS}` };
  }
  // numeric(4,1) in the DB: one decimal place.
  const clamped = Math.min(WALK_INTERVAL_MAX_HOURS, Math.max(WALK_INTERVAL_MIN_HOURS, parsed));
  return { value: Math.round(clamped * 10) / 10 };
}

/** Optional "every N days" cleaning interval: blank → null; else whole days clamped to 1–90. */
export function parseHabitatIntervalDays(raw: string): ParsedInterval {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: null,
      error: `Enter a number of days between ${HABITAT_INTERVAL_MIN_DAYS} and ${HABITAT_INTERVAL_MAX_DAYS}`,
    };
  }
  return { value: Math.min(HABITAT_INTERVAL_MAX_DAYS, Math.max(HABITAT_INTERVAL_MIN_DAYS, Math.round(parsed))) };
}

/** The noun the species cleans: "litter tray", "tank", "cage" (generic "habitat" otherwise). */
export function habitatNounFor(species: Species | string | null | undefined): string {
  return speciesProfile(species).wording.habitatNoun ?? 'habitat';
}

/** Placeholder / blank-means value for the walk field. */
export function suggestedWalkHours(): number {
  return DEFAULT_WALK_INTERVAL_HOURS;
}

/** Placeholder / blank-means value for the cleaning field. */
export function suggestedHabitatDays(species: Species | string | null | undefined): number {
  return suggestedHabitatDaysOf(speciesProfile(species));
}

/** Which Phase 2 Routine sections the chosen goals need. */
export function rhythmSections(selected: readonly string[]): { walks: boolean; habitat: boolean } {
  return { walks: selected.includes('walks'), habitat: selected.includes('habitat') };
}
