/// <reference types="jest" />
/**
 * Phase 1 goals step (docs/CARE_MODULES_PLAN.md): the pure logic behind PetWizard's
 * "What do you want help with?" and the pet profile's Care plan row (components/care/goals.ts).
 */
import type { CareModuleId } from '../db/models';
import { LEGACY_CARE_MODULES } from '../db/models';
import {
  carePlanSummary,
  goalOptions,
  goalSections,
  goalsForSpeciesChange,
  goalsSpecies,
  goalsToSave,
  initialGoals,
  sameGoals,
  toggleGoal,
} from '../../components/care/goals';
import { mkPet } from './helpers/fixtures';

const ids = (opts: { id: CareModuleId }[]) => opts.map((o) => o.id);

describe('goal options', () => {
  it('offers only implemented modules for the species, in registry order', () => {
    expect(ids(goalOptions('dog'))).toEqual(['potty', 'walks', 'meals', 'meds', 'visits']);
    expect(ids(goalOptions('cat'))).toEqual(['potty', 'meals', 'meds', 'habitat', 'visits']);
    expect(ids(goalOptions('hamster'))).toEqual(['meals', 'meds', 'habitat', 'visits']);
    expect(ids(goalOptions('fish'))).toEqual(['meals', 'habitat', 'visits']);
  });

  it('keeps a stored module the species would not be offered, so it can be unticked', () => {
    // An existing hamster backfilled with potty by 0019.
    expect(ids(goalOptions('hamster', LEGACY_CARE_MODULES))).toEqual(['potty', 'meals', 'meds', 'habitat', 'visits']);
  });

  it('words potty for the species, from lib/care/species.ts', () => {
    expect(goalOptions('dog')[0].title).toBe('Potty breaks');
    expect(goalOptions('cat')[0].title).toBe('Litter box trips');
    expect(goalOptions('cat')[0].description).toContain('litter box trip');
  });

  it('reads an unknown species as other', () => {
    expect(ids(goalOptions('dragon'))).toEqual(ids(goalOptions('other')));
  });
});

describe('initial goals', () => {
  it('pre-ticks the species defaults for a new pet', () => {
    expect(initialGoals('dog')).toEqual(['potty', 'walks', 'meals', 'meds', 'visits']);
    // Product decision: cats start without potty.
    expect(initialGoals('cat')).toEqual(['habitat', 'meals', 'meds', 'visits']);
    expect(initialGoals('fish')).toEqual(['habitat', 'meals']);
  });

  it("uses an edited pet's stored list, not the species defaults", () => {
    expect(initialGoals('cat', ['potty', 'visits'])).toEqual(['potty', 'visits']);
    expect(initialGoals('dog', LEGACY_CARE_MODULES)).toEqual(['potty', 'meals', 'meds', 'visits']);
  });

  it('keeps a stored list as is, in registry order (walks is implemented since Phase 2)', () => {
    expect(initialGoals('dog', ['walks', 'potty'])).toEqual(['potty', 'walks']);
  });

  it("takes the edited pet's stored species, else the picked kind", () => {
    expect(goalsSpecies(mkPet({ id: 'p', name: 'P', species: 'cat' }), 'Dog')).toBe('cat');
    expect(goalsSpecies(undefined, 'Rabbit')).toBe('rabbit');
    expect(goalsSpecies(undefined, undefined)).toBeNull();
  });
});

describe('toggling', () => {
  it('ticks in registry order and unticks', () => {
    expect(toggleGoal(['meds'], 'potty')).toEqual(['potty', 'meds']);
    expect(toggleGoal(['potty', 'meds'], 'potty')).toEqual(['meds']);
  });

  it('never unticks the last module', () => {
    expect(toggleGoal(['meals'], 'meals')).toEqual(['meals']);
  });
});

describe('changing the kind of a new pet', () => {
  it('follows the new defaults while untouched', () => {
    expect(goalsForSpeciesChange(['potty', 'meals', 'meds', 'visits'], 'cat', false)).toEqual(['habitat', 'meals', 'meds', 'visits']);
  });

  it('keeps touched choices that still apply', () => {
    expect(goalsForSpeciesChange(['potty', 'meds'], 'hamster', true)).toEqual(['meds']);
    expect(goalsForSpeciesChange(['potty'], 'fish', true)).toEqual(['habitat', 'meals']);
  });
});

describe('saving', () => {
  it('writes the explicit list in registry order', () => {
    expect(goalsToSave(['meds', 'potty'])).toEqual(['potty', 'meds']);
    // walks is implemented since Phase 2, so unticking it really removes it.
    expect(goalsToSave(['meals'], ['walks', 'potty', 'meals'])).toEqual(['meals']);
  });

  it('compares lists order-insensitively', () => {
    expect(sameGoals(['potty', 'meals'], ['meals', 'potty'])).toBe(true);
    expect(sameGoals(['potty'], ['potty', 'meals'])).toBe(false);
  });
});

describe('wizard sections', () => {
  it('with every module ticked, shows every section exactly as today', () => {
    expect(goalSections(LEGACY_CARE_MODULES)).toEqual({ meals: true, potty: true, meds: true });
  });

  it('hides sections whose module is off', () => {
    expect(goalSections(['meals', 'visits'])).toEqual({ meals: true, potty: false, meds: false });
  });
});

describe('care plan summary', () => {
  it('lists the enabled modules in the species wording', () => {
    expect(carePlanSummary(mkPet({ id: 'd', name: 'Dog' }))).toBe('Potty breaks · Meal times · Medications · Vet visits');
    expect(carePlanSummary(mkPet({ id: 'c', name: 'Cat', species: 'cat', careModules: ['potty', 'meals'] }))).toBe(
      'Litter box trips · Meal times',
    );
    expect(carePlanSummary(mkPet({ id: 'e', name: 'Empty', careModules: [] }))).toBe('Nothing chosen yet');
  });
});
