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

export type UpcomingKind = 'upcoming' | 'due' | 'overdue';

export type UpcomingItem = {
  id: string;
  type: 'pee' | 'poo' | 'food' | 'medication';
  icon: string;
  label: string;
  timeStart: Date;
  timeEnd: Date;
  kind: UpcomingKind;
  /** How far past the predicted time we are, in ms — 0 unless `kind` is 'overdue'. */
  overdueBy: number;
};

export type RepeatingPrediction = { predicted: Date; overdueBy: number };

/**
 * Finds the next occurrence of an event repeating every `intervalHours`, anchored to `anchor`.
 * Steps at most one interval past the anchor — a prediction whose time has already passed stays
 * put and reports `overdueBy` (ms past predicted, 0 when still ahead) rather than silently
 * rolling forward to the following interval and masking the miss.
 */
function nextRepeating(anchor: Date, intervalHours: number, now: Date): RepeatingPrediction {
  const intervalMs = intervalHours * HOUR_MS;
  const predicted =
    anchor.getTime() > now.getTime() ? new Date(anchor) : new Date(anchor.getTime() + intervalMs);
  return { predicted, overdueBy: Math.max(0, now.getTime() - predicted.getTime()) };
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

  // Next feed = earliest future feed time that isn't already logged/done, so a meal marked
  // done ahead of its time (e.g. Dinner logged early from the Food screen) drops out of
  // Upcoming instead of lingering. Slot indexes align with getTodaysMeals (same parse/sort).
  const meals = getTodaysMeals(pet, now, logs);
  const nextFeedIndex = todaysFeedTimes.findIndex(
    (t, i) => t.getTime() > now.getTime() && meals[i]?.status !== 'done'
  );
  const nextFeedTime = nextFeedIndex === -1 ? new Date(todaysFeedTimes[0].getTime() + DAY_MS) : todaysFeedTimes[nextFeedIndex];
  const nextMeal = nameMeal(nextFeedIndex === -1 ? 0 : nextFeedIndex, todaysFeedTimes.length, nextFeedTime.getHours());
  items.push({
    id: 'food',
    type: 'food',
    icon: nextMeal.icon,
    label: nextMeal.name,
    timeStart: nextFeedTime,
    timeEnd: nextFeedTime,
    kind: 'upcoming',
    overdueBy: 0,
  });

  const addHoldItem = (type: 'pee' | 'poo', icon: string, label: string, holdHours: number | null) => {
    if (holdHours == null) return;
    const lastLog = mostRecentLog(logs, type);
    const anchor = lastLog ? new Date(lastLog.timestamp) : scheduleAnchor;
    const { predicted, overdueBy } = nextRepeating(anchor, holdHours, now);
    const buffer = bufferMsFor(holdHours);
    const kind: UpcomingKind =
      overdueBy > 0 ? 'overdue' : now.getTime() >= predicted.getTime() - buffer ? 'due' : 'upcoming';
    const timeStart = new Date(Math.max(now.getTime(), predicted.getTime() - buffer));
    const timeEnd = new Date(Math.max(timeStart.getTime(), predicted.getTime() + buffer));
    items.push({ id: type, type, icon, label, timeStart, timeEnd, kind, overdueBy });
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
        kind: 'upcoming',
        overdueBy: 0,
      };
      return item;
    })
    .filter((item): item is UpcomingItem => item !== null)
    .sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime());
}

export type ScheduleRowStatus = 'done' | 'due' | 'upcoming';

export type ScheduleRowItem = {
  id: string;
  icon: string;
  name: string;
  time: Date;
  status: ScheduleRowStatus;
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
 * A slot counts as done only when a food log covers it (logging "Dinner" early covers that
 * slot right away rather than waiting on the clock) — the clock alone never marks a meal fed.
 *
 * Matching food logs to slots is done by meal *name* first: a log labelled "Dinner" marks the
 * Dinner slot done rather than whichever meal falls earliest in the day. This lets the Food
 * screen mark any specific meal done (even out of order) and have that exact row flip. Any
 * remaining logs that don't name-match a slot then cover the earliest still-uncovered slots in
 * chronological order, so the total done count still equals the number of food logs (capped at
 * the slot count) — MealTimeBanner, which only ever logs the currently-due meal, is unaffected.
 * `logs` is optional so this still works as a pure time-based preview when log history isn't at
 * hand (everything past then reads as due).
 */
export function getTodaysMeals(pet: Pet, now: Date = new Date(), logs: TimelineEntry[] = []): ScheduleRowItem[] {
  const todayStart = startOfDay(now);
  const foodLogsToday = logs.filter((l) => l.type === 'food' && l.timestamp >= todayStart);

  const times = pet.feedTimes
    .map((t) => parseClockTime(t, now))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const metas = times.map((time, i) => nameMeal(i, times.length, time.getHours()));
  const covered = new Array<boolean>(times.length).fill(false);
  const unmatched = [...foodLogsToday];

  // Pass 1: name match — a log covers the first slot whose meal name it shares.
  for (let i = 0; i < metas.length; i++) {
    const idx = unmatched.findIndex((l) => l.label === metas[i].name);
    if (idx !== -1) {
      covered[i] = true;
      unmatched.splice(idx, 1);
    }
  }
  // Pass 2: leftover logs cover the earliest still-uncovered slots, in order.
  for (let i = 0; i < covered.length && unmatched.length > 0; i++) {
    if (!covered[i]) {
      covered[i] = true;
      unmatched.shift();
    }
  }

  return times.map((time, i) => {
    const meta = metas[i];
    const timePassed = time.getTime() <= now.getTime();
    const item: ScheduleRowItem = {
      id: `meal-${i}-${time.getTime()}`,
      icon: meta.icon,
      name: meta.name,
      time,
      status: covered[i] ? 'done' : timePassed ? 'due' : 'upcoming',
    };
    return item;
  });
}

/**
 * Today's medications, one per configured medication — independent of feed/hold calibration.
 * Still purely time-based ('done' once the time passes): there's no medication log type yet
 * to verify against, so meds can't use the logged-only 'done' semantics meals have.
 */
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

/** Minutes past midnight, local time, for a log's timestamp. */
function minuteOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  return d.getHours() * 60 + d.getMinutes();
}

/** Distinct calendar days a bucket's logs were observed on. */
function daysObserved(bucket: TimelineEntry[]): number {
  return new Set(bucket.map((l) => startOfDay(new Date(l.timestamp)))).size;
}

/**
 * Usual feed times inferred from food logs' time-of-day. Logs from the last week are bucketed
 * by time-of-day (a log joins a bucket when it's within an hour of the bucket's average), so
 * the same meal logged across several days collapses into one slot instead of counting once
 * per day. Each bucket contributes its median time. Buckets observed on 2+ distinct days are
 * preferred (a real recurring meal, not a one-off snack); when no bucket has that much history
 * yet — e.g. a single day of logs — every bucket is used so inference can still bootstrap.
 */
function inferFeedTimes(logs: TimelineEntry[]): string[] {
  const food = logs.filter((l) => l.type === 'food').sort((a, b) => b.timestamp - a.timestamp);
  if (food.length === 0) return [];

  const cutoff = food[0].timestamp - 7 * DAY_MS;
  const recent = food
    .filter((l) => l.timestamp >= cutoff)
    .sort((a, b) => minuteOfDay(a.timestamp) - minuteOfDay(b.timestamp));

  const buckets: TimelineEntry[][] = [];
  for (const log of recent) {
    const bucket = buckets[buckets.length - 1];
    if (bucket) {
      const avg = bucket.reduce((sum, l) => sum + minuteOfDay(l.timestamp), 0) / bucket.length;
      if (minuteOfDay(log.timestamp) - avg <= 60) {
        bucket.push(log);
        continue;
      }
    }
    buckets.push([log]);
  }

  const recurring = buckets.filter((b) => daysObserved(b) >= 2);
  const usable = recurring.length > 0 ? recurring : buckets;

  // Buckets (and logs within them) are already ordered by time-of-day, so the median element
  // per bucket yields feed times in chronological order.
  return usable
    .map((bucket) => bucket[Math.floor((bucket.length - 1) / 2)])
    .map((l) => formatClock(new Date(l.timestamp)));
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
