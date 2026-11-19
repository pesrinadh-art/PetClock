/**
 * Species profiles (docs/CARE_MODULES_PLAN.md, "Species profiles"): one row per Species.
 *
 * This table is read only when a pet is CREATED (its defaults) and by a future "Reset to
 * suggested" button. It is never read to decide behaviour at runtime — that is the pet's stored
 * `careModules` list, which is also what the server gates the potty push on. Changing a row
 * here needs frontend + backend sign-off (plan, "Guardrails" 5).
 *
 * Rows may reference modules that are not implemented yet (walks, habitat: Phase 2). Use
 * {@link defaultCareModules} for a new pet: it keeps only modules this build implements, so a
 * pet created today does not silently gain walk/habitat reminders when Phase 2 ships.
 */
import type { CareModuleId, Species } from '../db/models';
import type { SpeciesProfile } from './types';
import { isImplemented } from './registry';

const ALL: readonly CareModuleId[] = ['potty', 'walks', 'meals', 'meds', 'habitat', 'visits'];

export const SPECIES_PROFILES: Record<Species, SpeciesProfile> = {
  dog: {
    species: 'dog',
    offered: ['potty', 'walks', 'meals', 'meds', 'visits'],
    defaults: ['potty', 'walks', 'meals', 'meds', 'visits'],
    // "Walk" is reserved for the walks module, so dog potty copy is "potty break / potty walk".
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty walk', habitatNoun: null },
  },
  cat: {
    species: 'cat',
    offered: ['potty', 'habitat', 'meals', 'meds', 'visits'],
    // Product decision (2026-11-19): potty prediction is offered but OFF by default for cats.
    defaults: ['habitat', 'meals', 'meds', 'visits'],
    wording: { pottyBreak: 'litter box trip', pottyPlace: 'litter box', habitatNoun: 'litter tray' },
  },
  rabbit: {
    species: 'rabbit',
    offered: ['potty', 'habitat', 'meals', 'meds', 'visits'],
    defaults: ['habitat', 'meals', 'meds', 'visits'],
    wording: { pottyBreak: 'litter box trip', pottyPlace: 'litter box', habitatNoun: 'hutch' },
  },
  hamster: {
    species: 'hamster',
    offered: ['habitat', 'meals', 'meds', 'visits'],
    defaults: ['habitat', 'meals', 'meds', 'visits'],
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty', habitatNoun: 'cage' },
  },
  bird: {
    species: 'bird',
    offered: ['habitat', 'meals', 'meds', 'visits'],
    defaults: ['habitat', 'meals', 'meds', 'visits'],
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty', habitatNoun: 'cage' },
  },
  fish: {
    species: 'fish',
    offered: ['habitat', 'meals', 'visits'],
    defaults: ['habitat', 'meals'],
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty', habitatNoun: 'tank' },
    habitatIntervalDays: 7,
  },
  turtle: {
    species: 'turtle',
    offered: ['habitat', 'meals', 'meds', 'visits'],
    defaults: ['habitat', 'meals', 'visits'],
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty', habitatNoun: 'tank' },
  },
  snake: {
    species: 'snake',
    offered: ['habitat', 'meals', 'meds', 'visits'],
    defaults: ['habitat', 'meals', 'visits'],
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty', habitatNoun: 'enclosure' },
  },
  other: {
    species: 'other',
    offered: ALL,
    defaults: ['meals', 'meds', 'visits'],
    wording: { pottyBreak: 'potty break', pottyPlace: 'potty', habitatNoun: 'habitat' },
  },
};

/** The profile for a species; unknown values (a newer build's species) read as 'other'. */
export function speciesProfile(species: Species | string | null | undefined): SpeciesProfile {
  return (
    (species && Object.prototype.hasOwnProperty.call(SPECIES_PROFILES, species)
      ? SPECIES_PROFILES[species as Species]
      : undefined) ?? SPECIES_PROFILES.other
  );
}

/** Modules this build can offer for a species (the offered row, minus unimplemented modules). */
export function offeredCareModules(species: Species | string | null | undefined): CareModuleId[] {
  return speciesProfile(species).offered.filter(isImplemented);
}

/**
 * The explicit list a NEW pet is stored with: the species' pre-ticked defaults, limited to
 * modules this build implements (see the file comment).
 */
export function defaultCareModules(species: Species | string | null | undefined): CareModuleId[] {
  return speciesProfile(species).defaults.filter(isImplemented);
}
