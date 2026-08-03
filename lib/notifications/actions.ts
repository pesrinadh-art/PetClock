import type { LogSource } from '../db/models';
import { repos } from '../repo/types';
import { scheduleSnoozeFollowup, type ScheduledNotificationData } from './scheduler';
import { clearSnooze, setSnooze } from './snoozeStore';

/**
 * SHARED nudge action logic — the single implementation of "Yes logs it" and "snooze re-asks",
 * called by BOTH the headless response handler (`responseHandler.ts`, a lock-screen action tap
 * with no React mounted) AND the in-app surfaces (`NudgeBanner`, the Notification Center, which
 * answer the same prediction from prediction data). Keeping one copy means the two paths can never
 * drift: an in-app "Yes" and a notification "Yes" write the exact same log.
 *
 * Everything here is React-free — it writes through `repos` directly and persists snoozes through
 * `snoozeStore`, so it works identically whether or not a React tree is mounted.
 */

// Contract timings: LOG_NO re-asks sooner than an explicit snooze.
export const SNOOZE_15_MS = 15 * 60 * 1000; // SNOOZE_15
export const REASK_NO_MS = 20 * 60 * 1000; // LOG_NO

/** ISO for a Yes write: the event's own time (predicted / slot time), so a delayed cold-start
 *  replay lands the log when it happened, not when the tap was finally processed. */
export function occurredAtFor(data: ScheduledNotificationData): string {
  if (data.kind === 'break_prediction') {
    const d = new Date(data.predictedAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const ms = Number(data.fireAtMs);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}

/**
 * LOG_YES: write the log straight through the repo (React-free) and clear any snooze on it.
 *
 * `source` defaults to `'notification_yes'` for the headless OS-notification path; the in-app
 * surfaces pass `'manual'` (no push produced the log). A non-empty `data.notificationId` links the
 * log to its push; the in-app payloads carry an empty id, which maps to null here.
 */
export async function logYes(
  data: ScheduledNotificationData,
  source: LogSource = 'notification_yes',
  occurredAtOverride?: string,
): Promise<void> {
  // Headless push path uses the event's own time (occurredAtFor). In-app answers pass `now`
  // via the override, so answering an overdue nudge advances the prediction past now and the
  // nudge clears — otherwise logging at the stale predicted time leaves it "due" and it re-shows.
  const occurredAt = occurredAtOverride ?? occurredAtFor(data);
  const notificationId =
    typeof data.notificationId === 'string' && data.notificationId ? data.notificationId : null;
  switch (data.kind) {
    case 'break_prediction':
      await repos.logs.add(data.petId, {
        type: data.breakType,
        occurredAt,
        source,
        notificationId,
      });
      break;
    case 'meal':
      await repos.logs.add(data.petId, {
        type: 'food',
        occurredAt,
        feedTimeId: data.feedTimeId,
        source,
        notificationId,
      });
      break;
    case 'medication':
    case 'med_escalation':
      await repos.logs.add(data.petId, {
        type: 'medication',
        occurredAt,
        medicationId: data.medicationId,
        source,
        notificationId,
      });
      break;
    case 'appointment':
      // Appointment reminders have no "Yes" button — nothing to log.
      return;
  }
  await clearSnooze(data.reconcileKey);
}

/**
 * LOG_NO / SNOOZE_15: push this nudge out to `untilMs`. Persists the snooze through `snoozeStore`
 * so the next reconcile honors it (instead of clobbering it with the pet's natural predicted time)
 * AND arms the re-ask follow-up right now. Both the in-app surfaces and the scheduler read the same
 * persisted snooze, so an in-app "Not yet" also silences the OS push, and vice-versa.
 */
export async function snoozeNudge(
  data: ScheduledNotificationData,
  untilMs: number,
): Promise<void> {
  await setSnooze(data.reconcileKey, untilMs);
  await scheduleSnoozeFollowup(data, untilMs);
}
