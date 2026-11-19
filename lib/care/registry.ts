/**
 * The care-module registry. Adding a module = one file in ./modules plus one line here.
 *
 * ARRAY ORDER IS EMISSION ORDER, not priority: it is the order today's code emits each pet's
 * pushes, nudges and quick-log items (breaks, then meals, then meds; appointments last), so
 * composing modules in this order reproduces today's lists exactly. Hero priority is the
 * separate `priority` field (see plan.ts).
 *
 * Phase 2 added walks and habitat (opt-in: existing pets keep their stored four). Walks sits
 * after potty and habitat after meds; for a pet without them every list is unchanged, and the
 * order is also the Goals step's display order.
 */
import type { CareModuleId } from '../db/models';
import { habitatModule } from './modules/habitat';
import { mealsModule } from './modules/meals';
import { medsModule } from './modules/meds';
import { pottyModule } from './modules/potty';
import { visitsModule } from './modules/visits';
import { walksModule } from './modules/walks';
import type { CareModule } from './types';

export const REGISTRY: readonly CareModule[] = [
  pottyModule,
  walksModule,
  mealsModule,
  medsModule,
  habitatModule,
  visitsModule,
];

/** True when this build implements `id` (species rows may name modules that ship later). */
export function isImplemented(id: CareModuleId): boolean {
  return REGISTRY.some((m) => m.id === id);
}

export function moduleById(id: CareModuleId): CareModule | undefined {
  return REGISTRY.find((m) => m.id === id);
}
