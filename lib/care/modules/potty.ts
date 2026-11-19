/**
 * Potty module — the flagship pee/poo prediction.
 *
 * This wraps today's code and adds only an on/off switch (the pet's `careModules`): the
 * prediction kernel stays `predictBreak` in lib/petSchedule.ts, mirrored on the server by
 * app.recompute_prediction (which gates on the same switch since 0019_care_modules.sql).
 *
 *  - status(): the old pet-level getPetStatus gate (hasSchedule: BOTH holds + an active feed
 *    time). It lives here now, so a pet with potty off is not stuck "calibrating".
 *  - hero(): today's PetCard hero, as data (components/PetCard.tsx).
 *  - upcoming/reminders/nudges: today's pee/poo rows, pushes and nudges.
 *  - quickLog(): Pee, Poo, and Both (a pee and a poo at the same instant).
 */
import type { LogEntry, Pet } from '../../db/models';
import {
  formatClock,
  formatTimeRange,
  getPetStatus,
  getUpcomingForPet,
  type UpcomingItem,
} from '../../petSchedule';
import { computeDesiredNotifications } from '../../notifications/scheduler';
import { computePendingNudges } from '../../notifications/pending';
import { gentleLate, petMeta } from '../../petVoice';
import type { CareModule, CareSnapshot, HeroModel } from '../types';
import { ALL_SPECIES } from './allSpecies';

const LOG_TYPES = ['pee', 'poo'] as const;

/** Only the log types this module declares (plan, "Guardrails" 3). */
function ownLogs(logs: LogEntry[]): LogEntry[] {
  return logs.filter((l) => (LOG_TYPES as readonly string[]).includes(l.type));
}

/** "1h 12m" / "45m" / "Now" — the hero countdown (verbatim from PetCard.tsx). */
export function countdown(ms: number): string {
  if (ms <= 0) return 'Now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The tighter of the two holds, in hours; Infinity when neither is set. */
export function tightestHoldHours(pet: Pet): number {
  return Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
}

function breakItems(s: CareSnapshot): UpcomingItem[] {
  return getUpcomingForPet(s.pet, s.feedTimes, ownLogs(s.logs), s.now, s.timeZone).filter(
    (u) => u.type === 'pee' || u.type === 'poo',
  );
}

/**
 * Today's PetCard hero (components/PetCard.tsx), with the same states and copy:
 * calibrating → learning, needsInfo, and when ready the next break as upcoming / due / late.
 */
function pottyHero(s: CareSnapshot): HeroModel {
  const { pet, now } = s;
  const status = getPetStatus(pet, s.feedTimes, now);
  const tightestHold = tightestHoldHours(pet);

  const hero: HeroModel = {
    moduleId: 'potty',
    state: 'idle',
    kicker: petMeta(pet, now),
    headline: pet.name,
    detail: '',
    progress: null,
    late: false,
    headlineMono: false,
  };

  if (status.kind === 'calibrating') {
    hero.state = 'learning';
    hero.kicker = `Day ${status.day} of 3`;
    hero.headline = `Getting to know ${pet.name}`;
    hero.detail = "Keep logging and we'll learn the routine.";
    return hero;
  }
  if (status.kind === 'needsInfo') {
    hero.state = 'needsInfo';
    hero.headline = `Let's set up ${pet.name}`;
    hero.detail = 'Add meal and potty times to get reminders.';
    return hero;
  }

  const next = getUpcomingForPet(pet, s.feedTimes, ownLogs(s.logs), now, s.timeZone).find((u) => u.type !== 'food');
  if (!next) {
    hero.detail = Number.isFinite(tightestHold) ? `${petMeta(pet, now)} · ${tightestHold}h hold time` : '';
    hero.kicker = 'No break predicted yet';
    return hero;
  }

  const what = next.type === 'poo' ? 'Poo break' : 'Pee break';
  if (next.kind === 'overdue') {
    hero.state = 'late';
    hero.late = true;
    hero.progress = 1;
    hero.kicker = what;
    hero.headline = gentleLate(Math.floor(next.overdueBy / 60_000)).replace(/^./, (c) => c.toUpperCase());
    hero.detail = `due ${formatClock(new Date(now.getTime() - next.overdueBy))}`;
    hero.headlineMono = false;
  } else if (next.kind === 'due') {
    hero.state = 'due';
    hero.progress = 1;
    hero.kicker = what;
    hero.headline = 'Due now';
    hero.detail = formatTimeRange(next.timeStart, next.timeEnd);
    hero.headlineMono = false;
  } else {
    hero.state = 'upcoming';
    hero.headlineMono = true;
    hero.kicker = `${what} in`;
    hero.headline = countdown(next.timeStart.getTime() - now.getTime());
    hero.detail = formatTimeRange(next.timeStart, next.timeEnd);
    // Ring fills as the break approaches: 0 just after a break, 1 when it's due.
    if (Number.isFinite(tightestHold) && tightestHold > 0) {
      const remaining = next.timeStart.getTime() - now.getTime();
      hero.progress = 1 - remaining / (tightestHold * 3_600_000);
    }
  }
  return hero;
}

export const pottyModule: CareModule = {
  id: 'potty',
  priority: 10,
  // Every species: the server gates potty on careModules alone (no species logic in SQL, ever),
  // and existing pets of any species were backfilled with potty. Which species are OFFERED
  // potty for a new pet is the species table's job (lib/care/species.ts), not this field's.
  appliesTo: ALL_SPECIES,
  logTypes: LOG_TYPES,

  status: (s) => getPetStatus(s.pet, s.feedTimes, s.now).kind,

  upcoming: breakItems,

  hero: pottyHero,

  quickLog: () => [
    { key: 'pee', icon: 'drop', label: 'Pee', verb: 'pee', writes: [{ type: 'pee' }] },
    { key: 'poo', icon: 'poo', label: 'Poo', verb: 'poo', writes: [{ type: 'poo' }] },
    // One instant for both logs; one Undo removes both.
    { key: 'both', icon: 'drop', label: 'Both', verb: 'go', writes: [{ type: 'pee' }, { type: 'poo' }] },
  ],

  reminders: (s, prefs) =>
    computeDesiredNotifications([s.pet], s.feedTimes, [], ownLogs(s.logs), [], prefs, s.now, s.timeZone).filter(
      (d) => d.data.kind === 'break_prediction',
    ),

  nudges: (s, snoozes) =>
    computePendingNudges([s.pet], s.feedTimes, [], ownLogs(s.logs), s.now, snoozes, s.timeZone).filter(
      (n) => n.kind === 'break',
    ),
};
