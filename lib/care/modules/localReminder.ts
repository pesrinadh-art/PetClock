/**
 * Local reminders for the care modules with their own rhythm (walks, habitat cleaning).
 *
 * They ride the SAME local scheduling path as every other reminder: the module returns a
 * DesiredNotification, lib/care/household.ts composes it with the rest, and the
 * NotificationObserver reconciles the OS's scheduled set (keyed by `reconcileKey`).
 *
 * The payload's `kind` is 'care_due', the contract kind the Phase 3 server push also uses
 * (shared/notificationContracts.ts, CareDuePushData). Locally scheduled ones keep the
 * tap-through-only appointment category: a body tap opens Today on the pet, and the walk or
 * clean is logged from the app. Server pushes carry the 'care-check' category (Done / Snooze).
 *
 * LOCAL MODE ONLY. Once server pushes are active (lib/push/mode.ts) the backend sends care_due
 * for this household, so these stand down exactly like potty's break reminders do: no local
 * copy is ever scheduled alongside the server's, and a user never gets both.
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
import { isServerPushActive } from '../../push/mode';

/** The contract kind shared with the Phase 3 server push. */
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
  // Server mode: the backend owns care reminders (care_due). Never schedule a duplicate.
  if (isServerPushActive()) return [];
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
      // careModule is typed as the wider CareModuleId here; cast at this one place.
      data: data as unknown as ScheduledNotificationData,
    },
  ];
}
