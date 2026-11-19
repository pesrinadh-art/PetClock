/**
 * Local reminders for the Phase 2 care modules (walks, habitat cleaning).
 *
 * They ride the SAME local scheduling path as every other reminder: the module returns a
 * DesiredNotification, lib/care/household.ts composes it with the rest, and the
 * NotificationObserver reconciles the OS's scheduled set (keyed by `reconcileKey`).
 *
 * The payload's `kind` is 'care_due' — the generic kind 0020_care_enums.sql reserves for
 * Phase 3's server push. It is NOT in the frozen contract's PawClockPushData union yet (that
 * is a two-sided Phase 3 change), so:
 *  - the payload is cast to ScheduledNotificationData here and nowhere else;
 *  - `isPawClockPush` rejects it, so a tap just opens the app (no headless write);
 *  - it uses the tap-through-only appointment category (no action buttons) and an existing
 *    Android channel.
 *
 * Mute is applied by the household composition (muted pets are skipped before any module
 * runs). Snooze, quiet hours and "never in the past" are applied here, the same way the
 * scheduler applies them to break and meal pushes.
 */
import {
  ANDROID_CHANNEL,
  CATEGORY,
  PUSH_PAYLOAD_VERSION,
} from '../../../shared/notificationContracts';
import type { CareModuleId, Pet } from '../../db/models';
import type {
  DesiredNotification,
  NotificationPrefs,
  ScheduledNotificationData,
} from '../../notifications/scheduler';

/** The Phase 3 generic kind, used locally ahead of its contract payload. */
export const CARE_DUE_KIND = 'care_due';

/** What a care_due local payload carries (mirrors the plan's `{careModule, petId, dueOn}`). */
export type CareDueLocalData = {
  v: typeof PUSH_PAYLOAD_VERSION;
  kind: typeof CARE_DUE_KIND;
  notificationId: string;
  actionToken: string;
  householdId: string;
  petId: string;
  petName: string;
  careModule: CareModuleId;
  /** ISO instant the care item falls due. */
  dueOn: string;
  url: string;
  reconcileKey: string;
  fireAtMs: number;
};

function parseHHMM(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Same rule as the scheduler's quiet hours (device wall clock, overnight window wraps). */
function inQuietHours(date: Date, prefs: NotificationPrefs): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
  const s = parseHHMM(prefs.quietHoursStart);
  const e = parseHHMM(prefs.quietHoursEnd);
  if (s == null || e == null || s === e) return false;
  const t = date.getHours() * 60 + date.getMinutes();
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * One care reminder for `pet`, or [] when it would fire in the past or inside quiet hours.
 * A live snooze for `key` overrides the natural fire time.
 */
export function careReminder(input: {
  pet: Pet;
  careModule: CareModuleId;
  key: string;
  fireAt: Date;
  dueAt: Date;
  title: string;
  body: string;
  prefs: NotificationPrefs;
  now: Date;
}): DesiredNotification[] {
  const { pet, prefs, now, key } = input;
  const nowMs = now.getTime();
  const snoozeUntil = prefs.snoozedUntil[key];
  const fireAt = snoozeUntil && snoozeUntil > nowMs ? new Date(snoozeUntil) : input.fireAt;
  if (fireAt.getTime() <= nowMs) return [];
  if (inQuietHours(fireAt, prefs)) return [];

  const fireAtMs = fireAt.getTime();
  const data: CareDueLocalData = {
    v: PUSH_PAYLOAD_VERSION,
    kind: CARE_DUE_KIND,
    notificationId: `${key}@${fireAtMs}`,
    actionToken: '',
    householdId: pet.householdId,
    petId: pet.id,
    petName: pet.name,
    careModule: input.careModule,
    dueOn: input.dueAt.toISOString(),
    url: `/?pet=${pet.id}`,
    reconcileKey: key,
    fireAtMs,
  };
  return [
    {
      key,
      fireAt,
      title: input.title,
      body: input.body,
      categoryId: CATEGORY.appointment,
      channelId: ANDROID_CHANNEL.appointment.id,
      // Not a contract payload yet (see the file comment): cast at this one place.
      data: data as unknown as ScheduledNotificationData,
    },
  ];
}
