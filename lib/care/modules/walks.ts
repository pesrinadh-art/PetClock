/**
 * Walks module (Phase 2) — "every N hours since the last walk" (rhythm engine).
 *
 * Product decision 1: walks run on an interval anchored on the most recent non-deleted walk
 * log; the interval is the pet's `walkIntervalHours` (pets.walk_interval_hours, via
 * rhythmsForPet). Nothing is predicted until the first walk is logged.
 *
 * Like potty's log-anchor branch (predictBreak, and the server since 0018), the next walk is
 * ALWAYS one interval after the last walk — never stepped further. A walk that is late stays
 * put and reads as overdue; it never rolls forward (CLAUDE.md, Δ7).
 *
 * Modules never read each other's logs: this module reads and writes only 'walk'. A
 * "Walk + pee" quick action is deliberately not offered here — it would write a potty log
 * from the walks module (plan, "Guardrails" 3) and push the dog's menu past its 5-item arc.
 */
import type { LogEntry, Pet } from '../../db/models';
import { formatClock, type UpcomingItem, type UpcomingKind } from '../../petSchedule';
import { gentleLate, petMeta } from '../../petVoice';
import { bufferMsFor, type BufferSpec } from '../engines/rhythm';
import { CARE_RHYTHMS } from '../flags';
import { rhythmsForPet } from '../rhythms';
import type { CareModule, CareSnapshot, HeroModel } from '../types';
import { ALL_SPECIES } from './allSpecies';
import { careReminder } from './localReminder';
import { countdown } from './potty';

const HOUR_MS = 60 * 60 * 1000;

const LOG_TYPES = ['walk'] as const;

/**
 * The walk window: ~10% of the interval, clamped to 5–20 min. The reminder fires this long
 * before the walk is due, and the row reads "due" from then. Walks' own values — the potty
 * buffer (POTTY_BUFFER) is mirrored by the server and must stay potty's.
 */
export const WALK_BUFFER: BufferSpec = { fraction: 0.1, minMinutes: 5, maxMinutes: 20 };

/** Only the log types this module declares (plan, "Guardrails" 3). */
function ownLogs(logs: LogEntry[]): LogEntry[] {
  return logs.filter((l) => (LOG_TYPES as readonly string[]).includes(l.type));
}

function lastWalk(logs: LogEntry[]): LogEntry | null {
  let best: LogEntry | null = null;
  let bestMs = -Infinity;
  for (const l of ownLogs(logs)) {
    if (l.deletedAt) continue;
    const ms = new Date(l.occurredAt).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      best = l;
      bestMs = ms;
    }
  }
  return best;
}

export type WalkPrediction = {
  /** The last walk's instant. */
  anchor: Date;
  intervalHours: number;
  /** anchor + interval. May be in the past: a missed walk stays put. */
  predictedAt: Date;
  bufferMs: number;
  /** predictedAt − buffer — when the reminder fires. */
  notifyAt: Date;
  /** ms past predictedAt (0 while still ahead). */
  overdueBy: number;
  kind: UpcomingKind;
};

/**
 * The next walk for `pet`, from its walk logs: the last walk + one interval. Null until a walk
 * has been logged. Never rolls forward.
 */
export function predictWalk(pet: Pet, logs: LogEntry[], now: Date): WalkPrediction | null {
  const last = lastWalk(logs);
  if (!last) return null;
  const { walkIntervalHours } = rhythmsForPet(pet);
  const anchor = new Date(last.occurredAt);
  const predictedAt = new Date(anchor.getTime() + walkIntervalHours * HOUR_MS);
  const bufferMs = bufferMsFor(walkIntervalHours, WALK_BUFFER);
  const overdueBy = Math.max(0, now.getTime() - predictedAt.getTime());
  const kind: UpcomingKind =
    overdueBy > 0 ? 'overdue' : now.getTime() >= predictedAt.getTime() - bufferMs ? 'due' : 'upcoming';
  return {
    anchor,
    intervalHours: walkIntervalHours,
    predictedAt,
    bufferMs,
    notifyAt: new Date(predictedAt.getTime() - bufferMs),
    overdueBy,
    kind,
  };
}

function walkUpcoming(s: CareSnapshot): UpcomingItem[] {
  const p = predictWalk(s.pet, s.logs, s.now);
  if (!p) return [];
  return [
    {
      id: 'walk',
      // UpcomingItem.type predates the walk log type (lib/petSchedule.ts); the care layer
      // draws rows through presentLogType, which knows 'walk'.
      type: 'walk' as unknown as UpcomingItem['type'],
      icon: '🦮',
      label: 'Walk',
      timeStart: p.predictedAt,
      timeEnd: p.predictedAt,
      kind: p.kind,
      overdueBy: p.overdueBy,
    },
  ];
}

/**
 * The walk hero, or null before the first walk is logged — then the next module in priority
 * order (or "all caught up") speaks instead of an empty walk card.
 */
function walkHero(s: CareSnapshot): HeroModel | null {
  const { pet, now } = s;
  const p = predictWalk(pet, s.logs, now);
  if (!p) return null;
  const hero: HeroModel = {
    moduleId: 'walks',
    state: 'upcoming',
    kicker: petMeta(pet, now),
    headline: pet.name,
    detail: '',
    progress: null,
    late: false,
    headlineMono: false,
  };
  if (p.kind === 'overdue') {
    hero.state = 'late';
    hero.late = true;
    hero.progress = 1;
    hero.kicker = 'Walk';
    hero.headline = gentleLate(Math.floor(p.overdueBy / 60_000)).replace(/^./, (c) => c.toUpperCase());
    hero.detail = `due ${formatClock(p.predictedAt)}`;
  } else if (p.kind === 'due') {
    hero.state = 'due';
    hero.progress = 1;
    hero.kicker = 'Walk';
    hero.headline = 'Due now';
    hero.detail = formatClock(p.predictedAt);
  } else {
    hero.state = 'upcoming';
    hero.headlineMono = true;
    hero.kicker = 'Walk in';
    hero.headline = countdown(p.predictedAt.getTime() - now.getTime());
    hero.detail = formatClock(p.predictedAt);
    // Ring fills as the walk approaches: 0 just after a walk, 1 when it's due.
    // Clamped: a walk logged with a future time would otherwise push this below 0.
    hero.progress = Math.max(0, Math.min(1, 1 - (p.predictedAt.getTime() - now.getTime()) / (p.intervalHours * HOUR_MS)));
  }
  return hero;
}

export const walksModule: CareModule = {
  id: 'walks',
  priority: 20,
  // Which species are OFFERED walks is the species table's job (only dogs and 'other' today);
  // a stored list is honoured for any species, like every other module.
  appliesTo: ALL_SPECIES,
  logTypes: LOG_TYPES,
  // A user-set interval: nothing to learn, so the row shows while potty is still calibrating.
  upcomingWhileLearning: true,

  upcoming: walkUpcoming,

  hero: walkHero,

  quickLog: () => [{ key: 'walk', icon: 'paw', label: 'Walk', verb: 'walk', writes: [{ type: 'walk' }] }],

  reminders: (s, prefs) => {
    if (!CARE_RHYTHMS) return [];
    const p = predictWalk(s.pet, s.logs, s.now);
    if (!p) return [];
    const hours = p.intervalHours;
    return careReminder({
      pet: s.pet,
      careModule: 'walks',
      key: `walk:${s.pet.id}`,
      fireAt: p.notifyAt,
      dueAt: p.predictedAt,
      title: `Walk time for ${s.pet.name} 🦮`,
      body: `It's been about ${hours} hour${hours === 1 ? '' : 's'} since the last walk.`,
      prefs,
      now: s.now,
    });
  },
};
