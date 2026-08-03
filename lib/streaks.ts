import type { FeedTime, LogEntry } from './db/models';

/**
 * Daily "everything fed" streak.
 *
 * A day *counts* when every active feed slot for that pet has a food log on that calendar
 * day — the same "a meal is done only once a food log covers it" rule the Food screen uses
 * (see getTodaysMeals in lib/petSchedule), collapsed to a per-day count: a day is complete
 * when its non-deleted food-log tally reaches the number of active feed slots.
 *
 * The streak is the run of consecutive complete days ending today. Today is special: while
 * it is still in progress (not yet complete) it neither counts nor breaks the streak — we
 * just start counting from yesterday — so a streak isn't shown as lost simply because the
 * day's later meals haven't happened yet.
 *
 * Pure: no clock or storage access beyond the injected `now`. Returns 0 when the pet has no
 * active feed slots (nothing to complete) or no qualifying history.
 */
export function computeStreak(
  feedTimes: FeedTime[],
  logs: LogEntry[],
  now: Date = new Date(),
): number {
  const required = feedTimes.filter((f) => f.active).length;
  if (required === 0) return 0;

  // Food logs tallied per local calendar day (keyed by that day's midnight epoch ms).
  const foodByDay = new Map<number, number>();
  for (const log of logs) {
    if (log.type !== 'food' || log.deletedAt) continue;
    const day = startOfDayMs(new Date(log.occurredAt));
    foodByDay.set(day, (foodByDay.get(day) ?? 0) + 1);
  }

  const isComplete = (dayMs: number): boolean => (foodByDay.get(dayMs) ?? 0) >= required;

  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  // Today in progress: don't break on it — begin the count at yesterday.
  if (!isComplete(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  // Step a calendar day at a time (setDate, not −24h) so DST transitions never skip a day.
  while (isComplete(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function startOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
