/**
 * Meals module — daily feed-time slots (schedule engine).
 *
 * Wraps today's code: the next-meal Upcoming row, meal pushes and meal nudges, and the "Fed"
 * quick log (a generic meal log with no slot; getTodaysMeals covers the earliest open slot).
 */
import type { LogEntry } from '../../db/models';
import { computeDesiredNotifications } from '../../notifications/scheduler';
import { computePendingNudges } from '../../notifications/pending';
import { nextMealItem } from '../engines/schedule';
import type { CareModule } from '../types';
import { ALL_SPECIES } from './allSpecies';

const LOG_TYPES = ['food'] as const;

function ownLogs(logs: LogEntry[]): LogEntry[] {
  return logs.filter((l) => (LOG_TYPES as readonly string[]).includes(l.type));
}

export const mealsModule: CareModule = {
  id: 'meals',
  priority: 40,
  appliesTo: ALL_SPECIES,
  logTypes: LOG_TYPES,

  upcoming: (s) => {
    const item = nextMealItem(s.pet, s.feedTimes, ownLogs(s.logs), s.now);
    return item ? [item] : [];
  },

  quickLog: () => [
    { key: 'fed', icon: 'bowl', label: 'Fed', verb: 'eat', writes: [{ type: 'food', feedTimeId: null }] },
  ],

  reminders: (s, prefs) =>
    computeDesiredNotifications([s.pet], s.feedTimes, [], ownLogs(s.logs), [], prefs, s.now).filter(
      (d) => d.data.kind === 'meal',
    ),

  nudges: (s, snoozes) =>
    computePendingNudges([s.pet], s.feedTimes, [], ownLogs(s.logs), s.now, snoozes).filter(
      (n) => n.kind === 'meal',
    ),
};
