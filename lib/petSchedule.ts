import type { Pet, TimelineEntry } from '../data/mockData';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type PetStatus =
  | { kind: 'ready' }
  | { kind: 'calibrating'; day: number }
  | { kind: 'needsInfo' };

export function hasSchedule(pet: Pet): boolean {
  return pet.feedTimes.length > 0 && pet.peeHoldHours != null && pet.poopHoldHours != null;
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How many of this pet's logs (of any type) fall on `now`'s calendar day. */
export function countLogsToday(logs: TimelineEntry[], now: Date = new Date()): number {
  const todayStart = startOfDay(now);
  return logs.filter((l) => l.timestamp >= todayStart).length;
}

export function getPetStatus(pet: Pet, now: Date = new Date()): PetStatus {
  if (hasSchedule(pet)) return { kind: 'ready' };
  const daysSince = Math.floor((now.getTime() - pet.createdAt) / DAY_MS);
  if (daysSince < 3) return { kind: 'calibrating', day: Math.min(3, daysSince + 1) };
  return { kind: 'needsInfo' };
}

/** Parses "7:30 AM" / "6 PM" / "12:00" into a Date on the same day as `reference`. */
export function parseClockTime(text: string, reference: Date): Date | null {
  const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  const result = new Date(reference);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Verbose form for reminder cards, e.g. "~25 min", "~2 hrs", "In 2 days". */
export function formatTimeUntil(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Now';
  const mins = Math.round(diffMs / (60 * 1000));
  if (mins < 60) return `~${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `~${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `In ${days} day${days === 1 ? '' : 's'}`;
}

/** Compact form for stat tiles, e.g. "25m", "2h", "3d". */
export function formatTimeUntilCompact(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Now';
  const mins = Math.round(diffMs / (60 * 1000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/** Formats a start/end pair, e.g. "1:45–2:15 PM" (shares the AM/PM suffix when both sides match). */
export function formatTimeRange(start: Date, end: Date): string {
  if (start.getTime() === end.getTime()) return formatClock(start);
  const startStr = formatClock(start);
  const endStr = formatClock(end);
  const [, startPeriod] = startStr.split(' ');
  const [, endPeriod] = endStr.split(' ');
  if (startPeriod && startPeriod === endPeriod) {
    return `${startStr.split(' ')[0]}–${endStr}`;
  }
  return `${startStr}–${endStr}`;
}

export type UpcomingItem = {
  id: string;
  type: 'pee' | 'poo' | 'food' | 'medication';
  icon: string;
  label: string;
  timeStart: Date;
  timeEnd: Date;
};

/** Finds the next occurrence of an event repeating every `intervalHours`, anchored to `anchor`. */
function nextRepeating(anchor: Date, intervalHours: number, now: Date): Date {
  const intervalMs = intervalHours * HOUR_MS;
  let next = new Date(anchor);
  while (next.getTime() <= now.getTime()) {
    next = new Date(next.getTime() + intervalMs);
  }
  return next;
}

/** Uncertainty window around a predicted hold-time break: ~15% of the hold duration, clamped to 10-45 min. */
function bufferMsFor(holdHours: number): number {
  const minutes = Math.min(45, Math.max(10, Math.round(holdHours * 60 * 0.15)));
  return minutes * 60 * 1000;
}

function mostRecentLog(logs: TimelineEntry[], type: 'pee' | 'poo'): TimelineEntry | null {
  const matches = logs.filter((l) => l.type === type);
  if (matches.length === 0) return null;
  return matches.reduce((latest, l) => (l.timestamp > latest.timestamp ? l : latest));
}

/**
 * Derives upcoming feed/pee/poop events from a pet's configured schedule.
 * Pee/poop breaks are predicted from the pet's *last logged* pee/poop (falling back to the
 * earliest feed time if nothing's been logged yet) plus their hold time, shown as a buffered
 * range rather than a single instant since it's an estimate. Empty if no schedule is set up.
 */
export function getUpcomingForPet(pet: Pet, logs: TimelineEntry[], now: Date = new Date()): UpcomingItem[] {
  if (!hasSchedule(pet)) return [];

  const todaysFeedTimes = pet.feedTimes
    .map((t) => parseClockTime(t, now))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (todaysFeedTimes.length === 0) return [];

  // Earliest feed time doubles as a stand-in "wake time" anchor when there's no log yet.
  const scheduleAnchor = todaysFeedTimes[0];
  const items: UpcomingItem[] = [];

  const nextFeedIndex = todaysFeedTimes.findIndex((t) => t.getTime() > now.getTime());
  const nextFeedTime = nextFeedIndex === -1 ? new Date(todaysFeedTimes[0].getTime() + DAY_MS) : todaysFeedTimes[nextFeedIndex];
  const nextMeal = nameMeal(nextFeedIndex === -1 ? 0 : nextFeedIndex, todaysFeedTimes.length, nextFeedTime.getHours());
  items.push({ id: 'food', type: 'food', icon: nextMeal.icon, label: nextMeal.name, timeStart: nextFeedTime, timeEnd: nextFeedTime });

  const addHoldItem = (type: 'pee' | 'poo', icon: string, label: string, holdHours: number | null) => {
    if (holdHours == null) return;
    const lastLog = mostRecentLog(logs, type);
    const anchor = lastLog ? new Date(lastLog.timestamp) : scheduleAnchor;
    const predicted = nextRepeating(anchor, holdHours, now);
    const buffer = bufferMsFor(holdHours);
    const timeStart = new Date(Math.max(now.getTime(), predicted.getTime() - buffer));
    const timeEnd = new Date(Math.max(timeStart.getTime(), predicted.getTime() + buffer));
    items.push({ id: type, type, icon, label, timeStart, timeEnd });
  };

  addHoldItem('pee', '💧', 'Pee break', pet.peeHoldHours);
  addHoldItem('poo', '💩', 'Poo break', pet.poopHoldHours);

  return items.sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime());
}

/**
 * Derives upcoming medication reminders from a pet's daily medication times.
 * Unlike feed/pee/poop, this doesn't depend on `hasSchedule` — meds show up on Home
 * regardless of whether the pee/poop calibration is done, since they're user-specified
 * fixed times rather than something we're learning.
 */
export function getUpcomingMedications(pet: Pet, now: Date = new Date()): UpcomingItem[] {
  return pet.medications
    .map((med) => {
      const parsed = parseClockTime(med.time, now);
      if (!parsed) return null;
      const time = parsed.getTime() > now.getTime() ? parsed : new Date(parsed.getTime() + DAY_MS);
      const item: UpcomingItem = {
        id: `med-${med.id}`,
        type: 'medication',
        icon: '💊',
        label: med.name,
        timeStart: time,
        timeEnd: time,
      };
      return item;
    })
    .filter((item): item is UpcomingItem => item !== null)
    .sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime());
}

export type ScheduleRowItem = {
  id: string;
  icon: string;
  name: string;
  time: Date;
  status: 'done' | 'upcoming';
};

/**
 * Names a meal slot by its position among the pet's *actual* daily meal count, not just its
 * clock hour — a pet fed twice a day gets Breakfast/Dinner (or Brunch/Dinner if that first meal
 * lands late morning), one fed three times gets Breakfast/Lunch/Dinner, and any extra slots
 * beyond that are Snacks (except the last, which stays Dinner).
 */
function nameMeal(index: number, total: number, hour: number): { name: string; icon: string } {
  if (total <= 1) return { name: 'Meal', icon: '🍽️' };

  if (total === 2) {
    if (index === 0) return hour >= 10 ? { name: 'Brunch', icon: '🥐' } : { name: 'Breakfast', icon: '🌅' };
    return { name: 'Dinner', icon: '🌙' };
  }

  if (index === 0) return { name: 'Breakfast', icon: '🌅' };
  if (index === total - 1) return { name: 'Dinner', icon: '🌙' };
  if (hour >= 11 && hour < 15) return { name: 'Lunch', icon: '☀️' };
  return { name: 'Snack', icon: '🍪' };
}

/**
 * Today's meals, one per configured feed time — only what's actually required for this pet.
 * A slot counts as done either because its time has passed, or because it's already been
 * explicitly logged today (logging "Dinner" early covers that slot right away rather than
 * waiting on the clock) — matched to slots in chronological order, so logging once covers
 * whichever meal comes first, logging twice covers the first two, and so on. `logs` is
 * optional so this still works as a pure time-based preview when log history isn't at hand.
 */
export function getTodaysMeals(pet: Pet, now: Date = new Date(), logs: TimelineEntry[] = []): ScheduleRowItem[] {
  const todayStart = startOfDay(now);
  const foodLogsToday = logs.filter((l) => l.type === 'food' && l.timestamp >= todayStart).length;

  const times = pet.feedTimes
    .map((t) => parseClockTime(t, now))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  return times.map((time, i) => {
    const meta = nameMeal(i, times.length, time.getHours());
    const timePassed = time.getTime() <= now.getTime();
    const loggedCovered = i < foodLogsToday;
    const item: ScheduleRowItem = {
      id: `meal-${i}-${time.getTime()}`,
      icon: meta.icon,
      name: meta.name,
      time,
      status: timePassed || loggedCovered ? 'done' : 'upcoming',
    };
    return item;
  });
}

/** Today's medications, one per configured medication — independent of feed/hold calibration. */
export function getTodaysMedications(pet: Pet, now: Date = new Date()): ScheduleRowItem[] {
  return pet.medications
    .map((med) => {
      const time = parseClockTime(med.time, now);
      if (!time) return null;
      const item: ScheduleRowItem = {
        id: `med-${med.id}`,
        icon: '💊',
        name: med.name,
        time,
        status: time.getTime() <= now.getTime() ? 'done' : 'upcoming',
      };
      return item;
    })
    .filter((item): item is ScheduleRowItem => item !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

export type InferredSchedule = {
  feedTimes: string[];
  peeHoldHours: number;
  poopHoldHours: number;
};

/** Average gap between consecutive logs of a type, in hours. Ignores gaps > 12h (overnight, not a "hold"). */
function averageIntervalHours(logs: TimelineEntry[], type: 'pee' | 'poo'): number | null {
  const matches = logs.filter((l) => l.type === type).sort((a, b) => a.timestamp - b.timestamp);
  if (matches.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < matches.length; i++) {
    intervals.push((matches[i].timestamp - matches[i - 1].timestamp) / HOUR_MS);
  }
  const reasonable = intervals.filter((h) => h > 0 && h <= 12);
  if (reasonable.length === 0) return null;

  const avg = reasonable.reduce((sum, h) => sum + h, 0) / reasonable.length;
  return Math.max(1, Math.round(avg * 2) / 2); // round to nearest half-hour, minimum 1h
}

/** Usual feed times inferred from the most recent food logs' time-of-day (not their dates). */
function inferFeedTimes(logs: TimelineEntry[]): string[] {
  const recentFood = logs
    .filter((l) => l.type === 'food')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);
  return recentFood
    .map((l) => new Date(l.timestamp))
    .sort((a, b) => a.getTime() - b.getTime())
    .map((d) => formatClock(d));
}

/**
 * Derives a schedule straight from logged activity — this is what actually fulfills the
 * "log a few pees, poos, and meals and we'll start predicting" promise made during calibration.
 * Returns null if there isn't yet enough history to infer all three pieces confidently
 * (at least 2 pee logs, 2 poop logs, and 1 food log).
 */
export function inferScheduleFromLogs(logs: TimelineEntry[]): InferredSchedule | null {
  const peeHoldHours = averageIntervalHours(logs, 'pee');
  const poopHoldHours = averageIntervalHours(logs, 'poo');
  const feedTimes = inferFeedTimes(logs);
  if (peeHoldHours == null || poopHoldHours == null || feedTimes.length === 0) return null;
  return { feedTimes, peeHoldHours, poopHoldHours };
}
