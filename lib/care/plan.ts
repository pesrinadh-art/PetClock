/**
 * Resolving a pet's care plan and composing its modules' outputs
 * (docs/CARE_MODULES_PLAN.md, "Resolving the care plan").
 *
 *   resolvePlan(pet)   = registry modules that apply to the species AND are in pet.careModules,
 *                        by hero priority
 *   heroFor(plan, s)   = first non-null module hero, else "all caught up"
 *   petStatus(plan, s) = 'ready' if any module is ready (or no module has a status at all)
 *
 * With careModules = potty, meals, meds, visits every function here reproduces today's output
 * exactly (lib/__tests__/careModules.test.ts proves it against the Phase 0 fixtures).
 */
import type {
  Appointment,
  CareModuleId,
  FeedTime,
  LogEntry,
  Medication,
  Pet,
} from '../db/models';
import type { PetStatus } from '../petSchedule';
import { petMeta } from '../petVoice';
import { presentLogType } from './logTypes';
import { REGISTRY } from './registry';
import { speciesProfile } from './species';
import type { CareModule, CareSnapshot, CareUpcomingItem, HeroModel, QuickLogAction } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A pet's resolved modules, in hero-priority order. Internal: screens get {@link CarePlanView}. */
export type CarePlan = readonly CareModule[];

/** What screens may see of a plan: module ids only — no species, no log types. */
export type CarePlanView = {
  moduleIds: readonly CareModuleId[];
  has(id: CareModuleId): boolean;
};

const byPriority = (a: CareModule, b: CareModule): number => a.priority - b.priority;

export function resolvePlan(pet: Pick<Pet, 'species' | 'careModules'>): CarePlan {
  return REGISTRY.filter(
    (m) => m.appliesTo.includes(pet.species) && pet.careModules.includes(m.id),
  ).sort(byPriority);
}

export function planView(plan: CarePlan): CarePlanView {
  const moduleIds = plan.map((m) => m.id);
  return { moduleIds, has: (id) => moduleIds.includes(id) };
}

/**
 * The plan in EMISSION order (registry array order — today's order of pushes, nudges and
 * quick-log items), as opposed to hero priority.
 */
export function inEmissionOrder(plan: CarePlan): CareModule[] {
  return REGISTRY.filter((m) => plan.includes(m));
}

/** Build the snapshot a pet's modules read. Callers pass that pet's rows only. */
export function buildSnapshot(input: {
  pet: Pet;
  feedTimes: FeedTime[];
  meds: Medication[];
  logs: LogEntry[];
  appts: Appointment[];
  now: Date;
  /** The household's IANA zone; omitted / null / empty = device zone. */
  timeZone?: string | null;
}): CareSnapshot {
  return {
    ...input,
    timeZone: input.timeZone || null,
    profile: speciesProfile(input.pet.species),
  };
}

/** "Day N of 3" of the calibration window (same formula getPetStatus has always used). */
export function calibrationDay(pet: Pet, now: Date): number {
  const daysSince = Math.floor((now.getTime() - new Date(pet.calibrationStartedAt).getTime()) / DAY_MS);
  return Math.min(3, daysSince + 1);
}

/**
 * The pet's overall status: ready if any module is ready, or if no module reports a status
 * (nothing to learn). Otherwise calibrating if any module is, else needsInfo.
 */
export function petStatus(plan: CarePlan, s: CareSnapshot): PetStatus {
  const statuses = plan.flatMap((m) => (m.status ? [m.status(s)] : []));
  if (statuses.length === 0 || statuses.includes('ready')) return { kind: 'ready' };
  if (statuses.includes('calibrating')) return { kind: 'calibrating', day: calibrationDay(s.pet, s.now) };
  return { kind: 'needsInfo' };
}

/** First non-null hero in strict priority order (product decision 3), else "all caught up". */
export function heroFor(plan: CarePlan, s: CareSnapshot): HeroModel {
  for (const m of plan) {
    const hero = m.hero?.(s);
    if (hero) return hero;
  }
  return {
    moduleId: null,
    state: 'caughtUp',
    kicker: petMeta(s.pet, s.now),
    headline: 'All caught up',
    detail: '',
    progress: null,
    late: false,
    headlineMono: false,
  };
}

/**
 * Tie-break for Upcoming rows at the same instant. Today's list put the next meal before the
 * breaks and both before medications (getUpcomingForPet's rows, then medication rows, stably
 * sorted), so equal times keep that order.
 */
const UPCOMING_TIE_RANK: Record<CareModuleId, number> = {
  meals: 0,
  potty: 1,
  walks: 2,
  meds: 3,
  habitat: 4,
  visits: 5,
};

/**
 * Every Upcoming row for the pet, soonest first (uncapped; the section caps at 5). While the
 * pet is still learning only `upcomingWhileLearning` modules contribute, as today.
 */
export function planUpcoming(plan: CarePlan, s: CareSnapshot): CareUpcomingItem[] {
  const ready = petStatus(plan, s).kind === 'ready';
  const rows: CareUpcomingItem[] = [];
  for (const m of inEmissionOrder(plan)) {
    if (!m.upcoming || (!ready && !m.upcomingWhileLearning)) continue;
    for (const item of m.upcoming(s)) {
      rows.push({ ...item, moduleId: m.id, lineIcon: presentLogType(item.type).icon });
    }
  }
  return rows.sort(
    (a, b) =>
      a.timeStart.getTime() - b.timeStart.getTime() ||
      UPCOMING_TIE_RANK[a.moduleId] - UPCOMING_TIE_RANK[b.moduleId],
  );
}

/** The "+ Log" menu items, in today's order (potty's Pee/Poo/Both, then Fed). */
export function planQuickLog(plan: CarePlan, s: CareSnapshot): QuickLogAction[] {
  return inEmissionOrder(plan).flatMap((m) => m.quickLog?.(s) ?? []);
}
