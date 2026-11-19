/**
 * Care goals ("What do you want help with?") — the pure logic behind the PetWizard Goals step
 * and the pet profile's Care plan row (docs/CARE_MODULES_PLAN.md, Phase 1).
 *
 * No React here, so it is testable in plain Node (lib/__tests__/goals.test.ts). It lives under
 * components/care/** because it is the one place in components that may read a pet's species:
 * screens ask it for options and labels and never branch on species themselves.
 *
 * Rules:
 *  - The options are the modules OFFERED for the species (lib/care/species.ts, limited to what
 *    this build implements), plus any implemented module the pet already has — so an existing
 *    pet whose stored list includes a module its species wouldn't be offered today can still see
 *    and untick it.
 *  - A new pet starts with the species' defaults; an existing pet with its stored list.
 *  - At least one visible module always stays selected.
 *  - Stored modules this build does not implement (written by a newer build) are never shown and
 *    never dropped on save.
 */
import type { CareModuleId, Pet, Species } from '../../lib/db/models';
import { REGISTRY, isImplemented } from '../../lib/care/registry';
import { defaultCareModules, offeredCareModules, speciesProfile } from '../../lib/care/species';
import type { IconName } from '../Icon';

export type GoalOption = {
  id: CareModuleId;
  title: string;
  description: string;
  icon: IconName;
};

/** Registry order (= emission order) is also the display order. */
const ORDER: readonly CareModuleId[] = REGISTRY.map((m) => m.id);

function sortByRegistry(ids: Iterable<CareModuleId>): CareModuleId[] {
  const set = new Set(ids);
  return ORDER.filter((id) => set.has(id));
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The species a goals list is chosen for. Editing: the pet's stored species (the wizard does not
 * change species on edit). New pet: the kind picked on the About step ("Dog" → dog); a kind with
 * no matching Species reads as 'other' via speciesProfile.
 */
export function goalsSpecies(editingPet: Pet | undefined, kindLabel: string | undefined): Species | string | null {
  if (editingPet) return editingPet.species;
  return kindLabel ? kindLabel.toLowerCase() : null;
}

/** Title / description / icon for one module, worded for the species. */
export function goalOption(id: CareModuleId, species: Species | string | null | undefined): GoalOption {
  const w = speciesProfile(species).wording;
  switch (id) {
    case 'potty':
      return {
        id,
        title: `${capitalize(w.pottyBreak)}s`,
        description: `Predict the next ${w.pottyBreak} and nudge you before it's due.`,
        icon: 'drop',
      };
    case 'walks':
      return { id, title: 'Walks', description: 'A reminder when a walk is due.', icon: 'paw' };
    case 'meals':
      return { id, title: 'Meal times', description: 'A reminder at each meal, so nobody double-feeds.', icon: 'bowl' };
    case 'meds':
      return { id, title: 'Medications', description: 'A nudge when a daily dose is due.', icon: 'pill' };
    case 'habitat':
      return {
        id,
        title: `Cleaning the ${w.habitatNoun ?? 'habitat'}`,
        description: `A reminder when the ${w.habitatNoun ?? 'habitat'} needs cleaning.`,
        icon: 'sparkle',
      };
    case 'visits':
      return { id, title: 'Vet visits', description: 'Appointments and vaccinations in one place.', icon: 'stethoscope' };
  }
}

/**
 * The modules to show on the Goals step: offered for the species, plus any implemented module
 * already in `current` (see the file comment), in registry order.
 */
export function goalOptions(species: Species | string | null | undefined, current: readonly CareModuleId[] = []): GoalOption[] {
  const ids = sortByRegistry([...offeredCareModules(species), ...current.filter(isImplemented)]);
  return ids.map((id) => goalOption(id, species));
}

/** Pre-ticked goals: the pet's stored list when editing, else the species' defaults. */
export function initialGoals(species: Species | string | null | undefined, stored?: readonly CareModuleId[]): CareModuleId[] {
  if (stored) return sortByRegistry(stored.filter(isImplemented));
  return defaultCareModules(species);
}

/**
 * Tick / untick one module. Unticking the last visible module is refused (returns `selected`
 * unchanged): a pet always gets help with something.
 */
export function toggleGoal(selected: readonly CareModuleId[], id: CareModuleId): CareModuleId[] {
  if (selected.includes(id)) {
    if (selected.length <= 1) return [...selected];
    return selected.filter((m) => m !== id);
  }
  return sortByRegistry([...selected, id]);
}

/**
 * A new pet's kind changed on the About step. Untouched goals follow the new species' defaults;
 * touched goals keep what still applies to the new species (falling back to its defaults when
 * nothing does).
 */
export function goalsForSpeciesChange(
  selected: readonly CareModuleId[],
  species: Species | string | null | undefined,
  touched: boolean,
): CareModuleId[] {
  if (!touched) return defaultCareModules(species);
  const offered = new Set(offeredCareModules(species));
  const kept = selected.filter((m) => offered.has(m));
  return kept.length > 0 ? sortByRegistry(kept) : defaultCareModules(species);
}

/**
 * The careModules list to save. Modules this build does not implement that the pet already had
 * (written by a newer build) are carried over untouched.
 */
export function goalsToSave(selected: readonly CareModuleId[], stored?: readonly CareModuleId[]): CareModuleId[] {
  const hidden = (stored ?? []).filter((m) => !isImplemented(m));
  const out = sortByRegistry(selected);
  for (const m of hidden) if (!out.includes(m)) out.push(m);
  return out;
}

/** True when two module lists hold the same modules (order-insensitive). */
export function sameGoals(a: readonly CareModuleId[], b: readonly CareModuleId[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((m) => sb.has(m));
}

/** Which wizard sections the chosen goals need. */
export function goalSections(selected: readonly CareModuleId[]): { meals: boolean; potty: boolean; meds: boolean } {
  return {
    meals: selected.includes('meals'),
    potty: selected.includes('potty'),
    meds: selected.includes('meds'),
  };
}

/** "Potty breaks · Meal times · Medications" — the pet profile's Care plan summary. */
export function carePlanSummary(pet: Pet): string {
  const ids = sortByRegistry(pet.careModules.filter(isImplemented));
  if (ids.length === 0) return 'Nothing chosen yet';
  return ids.map((id) => goalOption(id, pet.species).title).join(' · ');
}
