/**
 * Calendar engine — dated items (appointments today; habitat "due on day N" in Phase 2).
 *
 * Dated items fire at a fixed time and stay overdue once missed; they never roll forward.
 * Appointment reminders wrap the existing scheduler unchanged.
 */
import type { Appointment } from '../../db/models';
import {
  computeDesiredNotifications,
  type DesiredNotification,
  type NotificationPrefs,
} from '../../notifications/scheduler';

/** Live (not deleted, not completed) appointments that include `petId`. */
export function appointmentsForPet(appts: Appointment[], petId: string): Appointment[] {
  return appts.filter((a) => !a.deletedAt && !a.completedAt && a.petIds.includes(petId));
}

/**
 * Reminder pushes for `appts`, one per reminder offset, exactly as computeDesiredNotifications
 * builds them (payload, copy, snooze override, quiet hours, never in the past). Appointment
 * reminders are not affected by per-pet mute, as today.
 */
export function appointmentReminders(
  appts: Appointment[],
  prefs: NotificationPrefs,
  now: Date,
): DesiredNotification[] {
  if (appts.length === 0) return [];
  return computeDesiredNotifications([], [], [], [], appts, prefs, now);
}
