/**
 * Schedule engine — fixed daily clock times (meals, medications).
 *
 * Wraps the existing lib/petSchedule.ts functions unchanged; nothing here re-derives a time.
 */
import type { FeedTime, LogEntry, Pet } from '../../db/models';
import {
  getTodaysMeals,
  getTodaysMedications,
  getUpcomingForPet,
  getUpcomingMedications,
  type UpcomingItem,
} from '../../petSchedule';

export { getTodaysMeals, getTodaysMedications, getUpcomingMedications };

/** Hold values that only open getUpcomingForPet's hasSchedule() gate; never read for meals. */
const GATE_HOLD_HOURS = 1;

/**
 * The next-meal Upcoming row, exactly as getUpcomingForPet builds it (next not-yet-done feed
 * slot today, else tomorrow's first), but WITHOUT that function's potty gate: getUpcomingForPet
 * returns nothing unless both potty holds are set, and with the potty module switched off the
 * meals row must still appear.
 *
 * The food row depends only on feed times, food logs and `now` (petSchedule.ts, the `food`
 * item), so it is read from getUpcomingForPet with placeholder holds rather than duplicating
 * the meal-naming / slot-coverage logic. Null when the pet has no active feed time.
 */
export function nextMealItem(
  pet: Pet,
  feedTimes: FeedTime[],
  logs: LogEntry[],
  now: Date,
): UpcomingItem | null {
  const gateOpen: Pet = { ...pet, peeHoldHours: GATE_HOLD_HOURS, poopHoldHours: GATE_HOLD_HOURS };
  const foodLogs = logs.filter((l) => l.type === 'food');
  return getUpcomingForPet(gateOpen, feedTimes, foodLogs, now).find((u) => u.type === 'food') ?? null;
}
