/**
 * Habitat cleaning module (Phase 2) — "due every N days" (calendar engine).
 *
 * Plan decision "Habitat engine": date-based, not the hold-hour rhythm. The next clean is due on
 * the household-local DATE of the last non-deleted 'habitat_clean' log + N days
 * (`habitatIntervalDays`, pets.habitat_interval_days, via rhythmsForPet), and its reminder fires
 * at 10:00 household time on that date (product decision 4). With no household timezone known
 * the device's zone is used instead.
 *
 * A missed clean stays overdue and never rolls forward to the next interval (CLAUDE.md, Δ7).
 * Nothing is due until the first clean is logged.
 *
 * Wording ("litter tray", "tank", "cage") comes from the species profile's habitat noun.
 */
import type { LogEntry, Pet } from '../../db/models';
import { parseClockTimeInZone, type UpcomingItem, type UpcomingKind } from '../../petSchedule';
import { CARE_RHYTHMS } from '../flags';
import { HABITAT_REMINDER_LOCAL_TIME, rhythmsForPet } from '../rhythms';
import type { CareModule, CareSnapshot, HeroModel, SpeciesProfile } from '../types';
import { ALL_SPECIES } from './allSpecies';
import { careReminder } from './localReminder';

const DAY_MS = 24 * 60 * 60 * 1000;

const LOG_TYPES = ['habitat_clean'] as const;

/** Only the log types this module declares (plan, "Guardrails" 3). */
function ownLogs(logs: LogEntry[]): LogEntry[] {
  return logs.filter((l) => (LOG_TYPES as readonly string[]).includes(l.type));
}

function lastClean(logs: LogEntry[]): LogEntry | null {
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

// ---------------------------------------------------------------------------
// Household-local calendar dates
// ---------------------------------------------------------------------------

/** A calendar date (month 1–12). */
export type LocalDate = { y: number; m: number; d: number };

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = zoneFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    zoneFormatters.set(timeZone, f);
  }
  return f;
}

/** Wall clock of instant `ms` in `timeZone`, encoded as UTC epoch ms. Throws on a bad zone. */
function wallClockMs(ms: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of zoneFormatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  if (!Number.isFinite(wall)) throw new RangeError(`Cannot resolve wall clock in ${timeZone}`);
  return wall;
}

/** The calendar date of instant `ms` in `timeZone` (device zone when null or unusable). */
export function localDateOf(ms: number, timeZone?: string | null): LocalDate {
  if (timeZone) {
    try {
      const w = new Date(wallClockMs(ms, timeZone));
      return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate() };
    } catch {
      /* fall through to the device zone */
    }
  }
  const t = new Date(ms);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/**
 * The instant of wall clock `hhmm` on `date` in `timeZone` (device zone when null or unusable).
 * DST gaps/overlaps resolve the way parseClockTimeInZone (and Postgres) resolve them.
 */
export function instantOn(date: LocalDate, hhmm: string, timeZone?: string | null): Date {
  if (timeZone) {
    try {
      // An instant that falls on `date` in the zone: local noon (UTC noon shifted by the zone's
      // offset there), so even ±13/14h zones land on the right calendar day.
      const utcNoon = Date.UTC(date.y, date.m - 1, date.d, 12);
      const localNoon = utcNoon - (wallClockMs(utcNoon, timeZone) - utcNoon);
      const at = parseClockTimeInZone(hhmm, new Date(localNoon), timeZone);
      if (at) return at;
    } catch {
      /* fall through to the device zone */
    }
  }
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(date.y, date.m - 1, date.d, h, mi, 0, 0);
}

// ---------------------------------------------------------------------------
// Due math
// ---------------------------------------------------------------------------

export type HabitatDue = {
  lastCleanedAt: Date;
  intervalDays: number;
  /** Household-local date the next clean is due: date(last clean) + N days. */
  dueOn: LocalDate;
  /** 10:00 household time on `dueOn` — when the reminder fires and the item turns overdue. */
  dueAt: Date;
  /** Calendar days from today (household-local) to `dueOn`; ≤ 0 once the date arrives. */
  daysUntil: number;
  /** ms past `dueAt` (0 while still ahead). */
  overdueBy: number;
  kind: UpcomingKind;
};

/**
 * When `pet`'s habitat is next due, from its habitat_clean logs. Null until a clean has been
 * logged. A missed date stays put and reads as overdue — it never rolls forward.
 *
 * `profile` is the pet's species profile; its suggested interval applies while the pet has no
 * interval of its own.
 */
export function habitatDue(
  pet: Pet,
  logs: LogEntry[],
  now: Date,
  timeZone?: string | null,
  profile?: Pick<SpeciesProfile, 'habitatIntervalDays'> | null,
): HabitatDue | null {
  const last = lastClean(logs);
  if (!last) return null;
  const { habitatIntervalDays } = rhythmsForPet(pet, profile);
  const lastCleanedAt = new Date(last.occurredAt);
  const dueOn = addDays(localDateOf(lastCleanedAt.getTime(), timeZone), habitatIntervalDays);
  const dueAt = instantOn(dueOn, HABITAT_REMINDER_LOCAL_TIME, timeZone);
  const overdueBy = Math.max(0, now.getTime() - dueAt.getTime());
  return {
    lastCleanedAt,
    intervalDays: habitatIntervalDays,
    dueOn,
    dueAt,
    daysUntil: daysBetween(localDateOf(now.getTime(), timeZone), dueOn),
    overdueBy,
    kind: overdueBy > 0 ? 'overdue' : 'upcoming',
  };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** The snapshot's household timezone, or null for device time. */
function snapshotTimeZone(s: CareSnapshot): string | null {
  const tz = s.timeZone;
  return typeof tz === 'string' && tz ? tz : null;
}

function nounOf(s: CareSnapshot): string {
  return s.profile.wording.habitatNoun ?? 'habitat';
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "today" / "tomorrow" / "in 3 days". */
function whenPhrase(daysUntil: number): string {
  if (daysUntil <= 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

/** "due today" / "due yesterday" / "due 3 days ago". */
function lateSince(daysUntil: number): string {
  if (daysUntil >= 0) return 'due today';
  if (daysUntil === -1) return 'due yesterday';
  return `due ${-daysUntil} days ago`;
}

function habitatUpcoming(s: CareSnapshot): UpcomingItem[] {
  const due = habitatDue(s.pet, s.logs, s.now, snapshotTimeZone(s), s.profile);
  if (!due) return [];
  return [
    {
      id: 'habitat',
      // UpcomingItem.type predates the habitat_clean log type (lib/petSchedule.ts); the care
      // layer draws rows through presentLogType, which knows 'habitat_clean'.
      type: 'habitat_clean' as unknown as UpcomingItem['type'],
      icon: '🧽',
      label: `Clean ${nounOf(s)}`,
      timeStart: due.dueAt,
      timeEnd: due.dueAt,
      kind: due.kind,
      overdueBy: due.overdueBy,
    },
  ];
}

/**
 * The habitat hero, or null before the first clean is logged (the next module in priority, or
 * "all caught up", speaks instead).
 */
function habitatHero(s: CareSnapshot): HeroModel | null {
  const due = habitatDue(s.pet, s.logs, s.now, snapshotTimeZone(s), s.profile);
  if (!due) return null;
  const noun = nounOf(s);
  const elapsed = s.now.getTime() - due.lastCleanedAt.getTime();
  const span = due.dueAt.getTime() - due.lastCleanedAt.getTime();
  if (due.kind === 'overdue') {
    return {
      moduleId: 'habitat',
      state: 'late',
      kicker: capitalize(noun),
      headline: `${capitalize(noun)} cleaning is due`,
      detail: lateSince(due.daysUntil),
      progress: 1,
      late: true,
      headlineMono: false,
    };
  }
  return {
    moduleId: 'habitat',
    state: 'upcoming',
    kicker: capitalize(noun),
    headline: `Clean ${noun} ${whenPhrase(due.daysUntil)}`,
    detail: `Every ${due.intervalDays} day${due.intervalDays === 1 ? '' : 's'}`,
    progress: span > 0 ? Math.min(1, Math.max(0, elapsed / span)) : 0,
    late: false,
    headlineMono: false,
  };
}

export const habitatModule: CareModule = {
  id: 'habitat',
  priority: 50,
  // Which species are OFFERED habitat cleaning is the species table's job; a stored list is
  // honoured for any species, like every other module.
  appliesTo: ALL_SPECIES,
  logTypes: LOG_TYPES,
  // A user-set interval: nothing to learn, so the row shows while potty is still calibrating.
  upcomingWhileLearning: true,

  upcoming: habitatUpcoming,

  hero: habitatHero,

  quickLog: (s) => [
    {
      key: 'habitat_clean',
      icon: 'sparkle',
      label: `Cleaned ${nounOf(s)}`,
      // "When did Luna get a clean litter tray?"
      verb: `get a clean ${nounOf(s)}`,
      writes: [{ type: 'habitat_clean' }],
    },
  ],

  reminders: (s, prefs) => {
    if (!CARE_RHYTHMS) return [];
    const due = habitatDue(s.pet, s.logs, s.now, snapshotTimeZone(s), s.profile);
    if (!due) return [];
    const noun = nounOf(s);
    // Fires once, at 10:00 on the due date. Once that has passed the item stays overdue in the
    // app; it is not re-scheduled for a later day (never in the past, never rolled forward).
    return careReminder({
      pet: s.pet,
      careModule: 'habitat',
      key: `habitat:${s.pet.id}`,
      fireAt: due.dueAt,
      dueAt: due.dueAt,
      title: `Time to clean the ${noun} 🧽`,
      body: `${s.pet.name}'s ${noun} is due for a clean today.`,
      prefs,
      now: s.now,
    });
  },
};
