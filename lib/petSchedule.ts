import type { FeedTime, LogEntry, Medication, Pet } from './db/models';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type PetStatus =
  | { kind: 'ready' }
  | { kind: 'calibrating'; day: number }
  | { kind: 'needsInfo' };

/** Epoch ms of a log's `occurredAt` ISO instant. */
function logMs(log: LogEntry): number {
  return new Date(log.occurredAt).getTime();
}

/** Non-deleted logs of a given type, oldest→newest untouched (callers sort as needed). */
function liveLogsOfType(logs: LogEntry[], type: LogEntry['type']): LogEntry[] {
  return logs.filter((l) => l.type === type && !l.deletedAt);
}

/** Active feed times parsed onto `reference`'s day, sorted chronologically. */
function activeFeedSlots(
  feedTimes: FeedTime[],
  reference: Date,
): { feedTime: FeedTime; time: Date }[] {
  return feedTimes
    .filter((f) => f.active)
    .map((feedTime) => ({ feedTime, time: parseClockTime(feedTime.localTime, reference) }))
    .filter((s): s is { feedTime: FeedTime; time: Date } => s.time !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function hasSchedule(pet: Pet, feedTimes: FeedTime[]): boolean {
  return (
    feedTimes.some((f) => f.active) && pet.peeHoldHours != null && pet.poopHoldHours != null
  );
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How many of this pet's logs (of any type) fall on `now`'s calendar day. */
export function countLogsToday(logs: LogEntry[], now: Date = new Date()): number {
  const todayStart = startOfDay(now);
  return logs.filter((l) => !l.deletedAt && logMs(l) >= todayStart).length;
}

export function getPetStatus(pet: Pet, feedTimes: FeedTime[], now: Date = new Date()): PetStatus {
  if (hasSchedule(pet, feedTimes)) return { kind: 'ready' };
  const daysSince = Math.floor((now.getTime() - new Date(pet.calibrationStartedAt).getTime()) / DAY_MS);
  if (daysSince < 3) return { kind: 'calibrating', day: Math.min(3, daysSince + 1) };
  return { kind: 'needsInfo' };
}

/** Parses "7:30 AM" / "6 PM" / "18:00" / "12:00" into a Date on the same day as `reference`. */
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

/** "HH:MM" 24-hour wall clock — the storage format for feed_times/medications. */
function formatClock24(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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

function mostRecentLog(logs: LogEntry[], type: 'pee' | 'poo'): LogEntry | null {
  const matches = liveLogsOfType(logs, type);
  if (matches.length === 0) return null;
  return matches.reduce((latest, l) => (logMs(l) > logMs(latest) ? l : latest));
}

/**
 * The raw hold-time prediction for one break type — the pure kernel behind both the Upcoming
 * UI (via {@link getUpcomingForPet}) and the notification scheduler (`lib/notifications`). Kept
 * as a single exported function so the scheduled push and the on-screen window can never drift
 * from one another: they are two projections of THIS computation.
 *
 * `predictedAt` is the un-clamped predicted instant (may be in the past — a missed break stays
 * put and reads as overdue, never rolls forward; see {@link nextRepeating}). `notifyAt` is the
 * moment the push should fire: `predictedAt − buffer`. Returns null when the pet has no usable
 * schedule for this break type.
 */
export type BreakPrediction = {
  breakType: 'pee' | 'poo';
  /** The anchor the prediction was stepped from (last log, else earliest feed slot). */
  anchor: Date;
  predictedAt: Date;
  bufferMs: number;
  /** predictedAt − buffer — when the notification fires. */
  notifyAt: Date;
  /** ms past predictedAt (0 when still ahead). */
  overdueBy: number;
};

export function predictBreak(
  pet: Pet,
  feedTimes: FeedTime[],
  logs: LogEntry[],
  type: 'pee' | 'poo',
  now: Date = new Date(),
): BreakPrediction | null {
  const holdHours = type === 'pee' ? pet.peeHoldHours : pet.poopHoldHours;
  if (!hasSchedule(pet, feedTimes) || holdHours == null) return null;
  const slots = activeFeedSlots(feedTimes, now);
  if (slots.length === 0) return null;

  const lastLog = mostRecentLog(logs, type);
  const bufferMs = bufferMsFor(holdHours);

  let anchor: Date;
  let predicted: Date;
  if (lastLog) {
    // After an actual break log, the next break is ALWAYS one hold-interval later (this matches
    // the server's app.recompute_prediction). We must NOT use nextRepeating here: its "anchor in
    // the future → predict at the anchor" branch is only right for the wake-time schedule anchor.
    // A break logged at ~now would otherwise predict ~now, leaving it stuck 'due' so a Yes tap
    // never clears the nudge and each tap re-logs.
    anchor = new Date(lastLog.occurredAt);
    predicted = new Date(anchor.getTime() + holdHours * 60 * 60 * 1000);
  } else {
    // No log yet: anchor on the earliest feed slot (a stand-in "wake time"); the first occurrence
    // at/after now is correct here, so nextRepeating is right.
    anchor = slots[0].time;
    predicted = nextRepeating(anchor, holdHours, now).predicted;
  }
  const overdueBy = Math.max(0, now.getTime() - predicted.getTime());
  return {
    breakType: type,
    anchor,
    predictedAt: predicted,
    bufferMs,
    notifyAt: new Date(predicted.getTime() - bufferMs),
    overdueBy,
  };
}

/**
 * Derives upcoming feed/pee/poop events from a pet's configured schedule.
 * Pee/poop breaks are predicted from the pet's *last logged* pee/poop (falling back to the
 * earliest feed time if nothing's been logged yet) plus their hold time, shown as a buffered
 * range rather than a single instant since it's an estimate. Empty if no schedule is set up.
 */
export function getUpcomingForPet(
  pet: Pet,
  feedTimes: FeedTime[],
  logs: LogEntry[],
  now: Date = new Date(),
): UpcomingItem[] {
  if (!hasSchedule(pet, feedTimes)) return [];

  const slots = activeFeedSlots(feedTimes, now);
  if (slots.length === 0) return [];
  const todaysFeedTimes = slots.map((s) => s.time);

  const items: UpcomingItem[] = [];

  // Next feed = earliest future feed time that isn't already logged/done, so a meal marked
  // done ahead of its time (e.g. Dinner logged early from the Food screen) drops out of
  // Upcoming instead of lingering. Slot indexes align with getTodaysMeals (same parse/sort).
  const meals = getTodaysMeals(feedTimes, now, logs);
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

  const addHoldItem = (type: 'pee' | 'poo', icon: string, label: string) => {
    // Same pure kernel the notification scheduler mirrors, so window and push stay in lockstep.
    const prediction = predictBreak(pet, feedTimes, logs, type, now);
    if (!prediction) return;
    const { predictedAt, bufferMs, overdueBy } = prediction;
    const predicted = predictedAt.getTime();
    const kind: UpcomingKind =
      overdueBy > 0 ? 'overdue' : now.getTime() >= predicted - bufferMs ? 'due' : 'upcoming';
    const timeStart = new Date(Math.max(now.getTime(), predicted - bufferMs));
    const timeEnd = new Date(Math.max(timeStart.getTime(), predicted + bufferMs));
    items.push({ id: type, type, icon, label, timeStart, timeEnd, kind, overdueBy });
  };

  addHoldItem('pee', '💧', 'Pee break');
  addHoldItem('poo', '💩', 'Poo break');

  return items.sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime());
}

/**
 * Derives upcoming medication reminders from a pet's daily medication times.
 * Unlike feed/pee/poop, this doesn't depend on `hasSchedule` — meds show up on Home
 * regardless of whether the pee/poop calibration is done, since they're user-specified
 * fixed times rather than something we're learning.
 */
export function getUpcomingMedications(medications: Medication[], now: Date = new Date()): UpcomingItem[] {
  return medications
    .filter((med) => med.active)
    .map((med) => {
      const parsed = parseClockTime(med.localTime, now);
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
  /** For meal rows: the feed_time this row represents, so logging it references the slot (Δ1). */
  feedTimeId?: string;
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
 * Δ1: matching food logs to slots is done by `feedTimeId` first — a log referencing the Dinner
 * slot marks the Dinner row done rather than whichever meal falls earliest in the day. This lets
 * the Food screen (and MealTimeBanner) mark any specific meal done, even out of order, and have
 * that exact row flip. Any remaining logs that don't reference a current slot then cover the
 * earliest still-uncovered slots in chronological order, so the total done count still equals
 * the number of food logs (capped at the slot count). `logs` is optional so this still works as
 * a pure time-based preview when log history isn't at hand (everything past then reads as due).
 */
export function getTodaysMeals(
  feedTimes: FeedTime[],
  now: Date = new Date(),
  logs: LogEntry[] = [],
): ScheduleRowItem[] {
  const todayStart = startOfDay(now);
  const foodLogsToday = liveLogsOfType(logs, 'food').filter((l) => logMs(l) >= todayStart);

  const slots = activeFeedSlots(feedTimes, now);

  const metas = slots.map((s, i) => nameMeal(i, slots.length, s.time.getHours()));
  const covered = new Array<boolean>(slots.length).fill(false);
  const unmatched = [...foodLogsToday];

  // Pass 1: feed-time-id match — a log covers the slot whose feed_time it references (Δ1).
  for (let i = 0; i < slots.length; i++) {
    const idx = unmatched.findIndex((l) => l.feedTimeId != null && l.feedTimeId === slots[i].feedTime.id);
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

  return slots.map((s, i) => {
    const meta = metas[i];
    const timePassed = s.time.getTime() <= now.getTime();
    const item: ScheduleRowItem = {
      id: `meal-${s.feedTime.id}`,
      icon: meta.icon,
      name: meta.name,
      time: s.time,
      status: covered[i] ? 'done' : timePassed ? 'due' : 'upcoming',
      feedTimeId: s.feedTime.id,
    };
    return item;
  });
}

/**
 * Today's medications, one per configured medication — independent of feed/hold calibration.
 * Still purely time-based ('done' once the time passes): the medication-log verification path
 * isn't wired in this wave, so meds can't yet use the logged-only 'done' semantics meals have.
 */
export function getTodaysMedications(medications: Medication[], now: Date = new Date()): ScheduleRowItem[] {
  return medications
    .filter((med) => med.active)
    .map((med) => {
      const time = parseClockTime(med.localTime, now);
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

/**
 * Δ3: logs no longer store icon/label — derive display from `type` (and, for food, the meal-slot
 * name resolved via `feedTimeId`). This reuses `nameMeal` as the single source of meal naming, so
 * Timeline and LogButtons agree with the Food screen's rows.
 */
export function describeLog(
  log: LogEntry,
  feedTimes: FeedTime[] = [],
  now: Date = new Date(),
): { icon: string; label: string } {
  switch (log.type) {
    case 'pee':
      return { icon: '💧', label: 'Pee' };
    case 'poo':
      return { icon: '💩', label: 'Poo' };
    case 'vet':
      return { icon: '🏥', label: 'Vet' };
    case 'medication':
      return { icon: '💊', label: 'Medication' };
    case 'food': {
      if (log.feedTimeId) {
        const slots = activeFeedSlots(feedTimes, now);
        const idx = slots.findIndex((s) => s.feedTime.id === log.feedTimeId);
        if (idx !== -1) {
          const meta = nameMeal(idx, slots.length, slots[idx].time.getHours());
          return { icon: meta.icon, label: meta.name };
        }
      }
      return { icon: '🍽️', label: 'Meal' };
    }
    default:
      return { icon: '📝', label: 'Log' };
  }
}

/** "HH:MM" strings, chronological — matches FeedTime.localTime so callers can write feed rows. */
export type InferredSchedule = {
  feedTimes: string[];
  peeHoldHours: number;
  poopHoldHours: number;
};

/** Average gap between consecutive logs of a type, in hours. Ignores gaps > 12h (overnight, not a "hold"). */
function averageIntervalHours(logs: LogEntry[], type: 'pee' | 'poo'): number | null {
  const matches = liveLogsOfType(logs, type).sort((a, b) => logMs(a) - logMs(b));
  if (matches.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < matches.length; i++) {
    intervals.push((logMs(matches[i]) - logMs(matches[i - 1])) / HOUR_MS);
  }
  const reasonable = intervals.filter((h) => h > 0 && h <= 12);
  if (reasonable.length === 0) return null;

  const avg = reasonable.reduce((sum, h) => sum + h, 0) / reasonable.length;
  return Math.max(1, Math.round(avg * 2) / 2); // round to nearest half-hour, minimum 1h
}

/** Minutes past midnight, local time, for a log's occurredAt instant. */
function minuteOfDay(log: LogEntry): number {
  const d = new Date(log.occurredAt);
  return d.getHours() * 60 + d.getMinutes();
}

/** Distinct calendar days a bucket's logs were observed on. */
function daysObserved(bucket: LogEntry[]): number {
  return new Set(bucket.map((l) => startOfDay(new Date(l.occurredAt)))).size;
}

/**
 * Usual feed times inferred from food logs' time-of-day. Logs from the last week are bucketed
 * by time-of-day (a log joins a bucket when it's within an hour of the bucket's average), so
 * the same meal logged across several days collapses into one slot instead of counting once
 * per day. Each bucket contributes its median time as an "HH:MM" 24-hour string. Buckets observed
 * on 2+ distinct days are preferred (a real recurring meal, not a one-off snack); when no bucket
 * has that much history yet — e.g. a single day of logs — every bucket is used so inference can
 * still bootstrap.
 */
function inferFeedTimes(logs: LogEntry[]): string[] {
  const food = liveLogsOfType(logs, 'food').sort((a, b) => logMs(b) - logMs(a));
  if (food.length === 0) return [];

  const cutoff = logMs(food[0]) - 7 * DAY_MS;
  const recent = food
    .filter((l) => logMs(l) >= cutoff)
    .sort((a, b) => minuteOfDay(a) - minuteOfDay(b));

  const buckets: LogEntry[][] = [];
  for (const log of recent) {
    const bucket = buckets[buckets.length - 1];
    if (bucket) {
      const avg = bucket.reduce((sum, l) => sum + minuteOfDay(l), 0) / bucket.length;
      if (minuteOfDay(log) - avg <= 60) {
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
    .map((l) => formatClock24(new Date(l.occurredAt)));
}

/**
 * Derives a schedule straight from logged activity — this is what actually fulfills the
 * "log a few pees, poos, and meals and we'll start predicting" promise made during calibration.
 * Returns null if there isn't yet enough history to infer all three pieces confidently
 * (at least 2 pee logs, 2 poop logs, and 1 food log).
 */
export function inferScheduleFromLogs(logs: LogEntry[]): InferredSchedule | null {
  const peeHoldHours = averageIntervalHours(logs, 'pee');
  const poopHoldHours = averageIntervalHours(logs, 'poo');
  const feedTimes = inferFeedTimes(logs);
  if (peeHoldHours == null || poopHoldHours == null || feedTimes.length === 0) return null;
  return { feedTimes, peeHoldHours, poopHoldHours };
}
