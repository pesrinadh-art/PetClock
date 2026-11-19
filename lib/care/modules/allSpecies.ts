import type { Species } from '../../db/models';

/**
 * Every Species. A module that the server runs for any pet (potty, meals, meds, visits) must
 * apply to every species, or the app would hide something the server still pushes. A Record so
 * a new Species member must be listed here.
 */
const SPECIES: Record<Species, true> = {
  dog: true,
  cat: true,
  rabbit: true,
  hamster: true,
  bird: true,
  turtle: true,
  snake: true,
  fish: true,
  other: true,
};

export const ALL_SPECIES: readonly Species[] = Object.keys(SPECIES) as Species[];
