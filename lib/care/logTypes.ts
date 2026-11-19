import type { IconName } from '../../components/Icon';
import type { LogType } from '../db/models';
import { category, logTint, terracotta } from '../../theme/colors';

/**
 * The one presentation table for log types (docs/CARE_MODULES_PLAN.md, Release N).
 *
 * Logs store only `type` (Δ3); every screen that draws a log derives its drawn icon, tint and
 * generic label from here. The `other` row is also the explicit fallback for UNKNOWN types: a
 * log written by a newer build (or read from data that skipped `toLogEntry`'s narrowing) still
 * renders, as "other", instead of crashing on a missing table row.
 *
 * Labels match `describeLog()` (lib/petSchedule.ts) for the generic case; food logs that resolve
 * to a meal slot get their slot name from `describeLog`, not from here.
 */
export type LogTypePresentation = {
  icon: IconName;
  label: string;
  /** Icon-tile background tint. */
  bg: string;
  /** Icon / ink colour on that tint. */
  fg: string;
};

/** The explicit other/unknown row. */
export const OTHER_LOG_PRESENTATION: LogTypePresentation = {
  icon: 'dots',
  label: 'Log',
  bg: category.otherBg,
  fg: category.otherInk,
};

export const LOG_TYPE_PRESENTATION: Record<LogType, LogTypePresentation> = {
  pee: { icon: 'drop', label: 'Pee', bg: logTint.peeBg, fg: logTint.peeInk },
  poo: { icon: 'poo', label: 'Poo', bg: logTint.pooBg, fg: logTint.pooInk },
  food: { icon: 'bowl', label: 'Meal', bg: terracotta.tint, fg: terracotta.ink },
  medication: { icon: 'pill', label: 'Medication', bg: category.medBg, fg: category.medInk },
  vet: { icon: 'vet', label: 'Vet', bg: category.vetBg, fg: category.vetInk },
  other: OTHER_LOG_PRESENTATION,
};

/**
 * Presentation for a log type, tolerating values this build does not know.
 *
 * `other` is the row used for the `'other'` type AND for any unknown type. A view whose
 * "other" styling differs (Timeline draws a paw on the accent tint) passes its own row; the
 * fallback rule stays the same everywhere.
 */
export function presentLogType(
  type: string,
  other: LogTypePresentation = OTHER_LOG_PRESENTATION,
): LogTypePresentation {
  if (type === 'other' || !Object.prototype.hasOwnProperty.call(LOG_TYPE_PRESENTATION, type)) {
    return other;
  }
  return LOG_TYPE_PRESENTATION[type as LogType];
}
