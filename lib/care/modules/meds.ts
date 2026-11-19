/**
 * Meds module — daily medication times (schedule engine).
 *
 * Wraps today's code: upcoming medication rows (shown whether or not potty is calibrated),
 * medication pushes and medication nudges. No quick log today (meds are logged from nudges).
 */
import type { LogEntry } from '../../db/models';
import { computeDesiredNotifications } from '../../notifications/scheduler';
import { computePendingNudges } from '../../notifications/pending';
import { getUpcomingMedications } from '../engines/schedule';
import type { CareModule } from '../types';
import { ALL_SPECIES } from './allSpecies';

const LOG_TYPES = ['medication'] as const;

function ownLogs(logs: LogEntry[]): LogEntry[] {
  return logs.filter((l) => (LOG_TYPES as readonly string[]).includes(l.type));
}

export const medsModule: CareModule = {
  id: 'meds',
  priority: 30,
  appliesTo: ALL_SPECIES,
  logTypes: LOG_TYPES,
  upcomingWhileLearning: true,

  upcoming: (s) => getUpcomingMedications(s.meds, s.now),

  reminders: (s, prefs) =>
    computeDesiredNotifications([s.pet], [], s.meds, ownLogs(s.logs), [], prefs, s.now).filter(
      (d) => d.data.kind === 'medication',
    ),

  nudges: (s, snoozes) =>
    computePendingNudges([s.pet], [], s.meds, ownLogs(s.logs), s.now, snoozes).filter(
      (n) => n.kind === 'medication',
    ),
};
