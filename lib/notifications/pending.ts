import { PUSH_PAYLOAD_VERSION } from '../../shared/notificationContracts';
import type { FeedTime, LogEntry, Medication, Pet } from '../db/models';
import { getTodaysMeals, parseClockTime, predictBreak } from '../petSchedule';
import type { ScheduledNotificationData } from './scheduler';

/**
 * Currently-due nudges derived from PREDICTION data (petSchedule), not from OS notifications — so
 * the in-app surfaces (NudgeBanner, Notification Center) work even when the push was suppressed in
 * the foreground, missed, or notification permission was never granted. Each nudge carries a fully
 * formed `ScheduledNotificationData` payload so the SHARED action logic (`logYes` / `snoozeNudge`)
 * answers it exactly like the headless handler answers a real push — one code path, no drift.
 *
 * This mirrors the payload shapes `computeDesiredNotifications` builds, but selects items that are
 * due NOW (predicted/slot time already reached) rather than the next FUTURE fire the scheduler arms.
 */

export type PendingKind = 'break' | 'meal' | 'medication';

export type PendingNudge = {
  /** === reconcileKey; also the snooze key. */
  key: string;
  petId: string;
  petName: string;
  kind: PendingKind;
  icon: string;
  /** e.g. "Did Mochi go?" / "Breakfast time" / "Rimadyl". */
  title: string;
  /** e.g. "Pee break" / "Time for Mochi's medication". */
  subtitle: string;
  /** ms past due — 0 when just due, larger = more urgent (used for ordering). */
  overdueBy: number;
  /** Payload the shared actions (`logYes` / `snoozeNudge`) consume. */
  data: ScheduledNotificationData;
};

// In LOCAL mode there is no server-issued token; the shared actions write through the repo.
const LOCAL_ACTION_TOKEN = '';

function indexByPet<T extends { petId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.petId);
    if (list) list.push(item);
    else map.set(item.petId, [item]);
  }
  return map;
}

function isSnoozed(snoozes: Record<string, number>, key: string, nowMs: number): boolean {
  const until = snoozes[key];
  return typeof until === 'number' && until > nowMs;
}

function medLoggedToday(logs: LogEntry[], medId: string, todayStart: number): boolean {
  return logs.some(
    (l) =>
      l.type === 'medication' &&
      l.medicationId === medId &&
      !l.deletedAt &&
      new Date(l.occurredAt).getTime() >= todayStart,
  );
}

function startOfDayMs(now: Date): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Compute the currently-due, still-answerable nudges for `pets`.
 *
 *  - Breaks: due once `now >= notifyAt` (predictedAt − buffer, the moment the push would fire),
 *    the same threshold `getUpcomingForPet` uses for its 'due'/'overdue' rows.
 *  - Meals: any today slot whose time has passed and isn't covered by a food log (status 'due').
 *  - Meds: an active med whose time today has passed with no medication log covering it today.
 *
 * A live snooze (from `snoozeStore`) drops the nudge. Ordered most-overdue first.
 */
export function computePendingNudges(
  pets: Pet[],
  feedTimes: FeedTime[],
  medications: Medication[],
  logs: LogEntry[],
  now: Date = new Date(),
  snoozes: Record<string, number> = {},
): PendingNudge[] {
  const nowMs = now.getTime();
  const todayStart = startOfDayMs(now);
  const feedByPet = indexByPet(feedTimes);
  const medsByPet = indexByPet(medications);
  const logsByPet = indexByPet(logs);
  const out: PendingNudge[] = [];

  for (const pet of pets) {
    if (pet.archivedAt) continue;
    const fts = feedByPet.get(pet.id) ?? [];
    const petLogs = logsByPet.get(pet.id) ?? [];

    // --- Breaks (the flagship).
    for (const breakType of ['pee', 'poo'] as const) {
      const p = predictBreak(pet, fts, petLogs, breakType, now);
      if (!p || p.notifyAt.getTime() > nowMs) continue; // not due yet
      const key = `break:${pet.id}:${breakType}`;
      if (isSnoozed(snoozes, key, nowMs)) continue;
      const fireAtMs = p.notifyAt.getTime();
      const data: ScheduledNotificationData = {
        v: PUSH_PAYLOAD_VERSION,
        kind: 'break_prediction',
        notificationId: '',
        actionToken: LOCAL_ACTION_TOKEN,
        householdId: pet.householdId,
        petId: pet.id,
        petName: pet.name,
        breakType,
        predictedAt: p.predictedAt.toISOString(),
        url: `/?pet=${pet.id}&type=${breakType}`,
        reconcileKey: key,
        fireAtMs,
      };
      out.push({
        key,
        petId: pet.id,
        petName: pet.name,
        kind: 'break',
        icon: breakType === 'pee' ? '💧' : '💩',
        title: `Did ${pet.name} go?`,
        subtitle: breakType === 'pee' ? 'Pee break' : 'Poo break',
        overdueBy: p.overdueBy,
        data,
      });
    }

    // --- Meals — a slot whose time has passed and isn't yet covered by a food log.
    for (const meal of getTodaysMeals(fts, now, petLogs)) {
      if (meal.status !== 'due' || !meal.feedTimeId) continue;
      const key = `meal:${pet.id}:${meal.feedTimeId}`;
      if (isSnoozed(snoozes, key, nowMs)) continue;
      const fireAtMs = meal.time.getTime();
      const data: ScheduledNotificationData = {
        v: PUSH_PAYLOAD_VERSION,
        kind: 'meal',
        notificationId: '',
        actionToken: LOCAL_ACTION_TOKEN,
        householdId: pet.householdId,
        petId: pet.id,
        petName: pet.name,
        feedTimeId: meal.feedTimeId,
        mealLabel: meal.name,
        url: `/food?pet=${pet.id}`,
        reconcileKey: key,
        fireAtMs,
      };
      out.push({
        key,
        petId: pet.id,
        petName: pet.name,
        kind: 'meal',
        icon: meal.icon,
        title: `${meal.name} time`,
        subtitle: `Did ${pet.name} eat?`,
        overdueBy: Math.max(0, nowMs - fireAtMs),
        data,
      });
    }

    // --- Meds — an active med whose time today has passed with no covering log today.
    for (const med of medsByPet.get(pet.id) ?? []) {
      if (!med.active) continue;
      const parsed = parseClockTime(med.localTime, now);
      if (!parsed || parsed.getTime() > nowMs) continue; // not due yet
      if (medLoggedToday(petLogs, med.id, todayStart)) continue;
      const key = `med:${pet.id}:${med.id}`;
      if (isSnoozed(snoozes, key, nowMs)) continue;
      const fireAtMs = parsed.getTime();
      const data: ScheduledNotificationData = {
        v: PUSH_PAYLOAD_VERSION,
        kind: 'medication',
        notificationId: '',
        actionToken: LOCAL_ACTION_TOKEN,
        householdId: pet.householdId,
        petId: pet.id,
        petName: pet.name,
        medicationId: med.id,
        medicationName: med.name,
        dosage: med.dosage,
        url: `/?pet=${pet.id}`,
        reconcileKey: key,
        fireAtMs,
      };
      out.push({
        key,
        petId: pet.id,
        petName: pet.name,
        kind: 'medication',
        icon: '💊',
        title: med.name,
        subtitle: `Time for ${pet.name}'s medication${med.dosage ? ` (${med.dosage})` : ''}`,
        overdueBy: Math.max(0, nowMs - fireAtMs),
        data,
      });
    }
  }

  out.sort((a, b) => b.overdueBy - a.overdueBy);
  return out;
}

/** Compact "just now" / "12m ago" / "2h ago" label for how overdue a nudge is. */
export function formatOverdue(overdueBy: number): string {
  if (overdueBy < 60 * 1000) return 'due now';
  const mins = Math.round(overdueBy / (60 * 1000));
  if (mins < 60) return `${mins}m overdue`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h overdue`;
  const days = Math.round(hours / 24);
  return `${days}d overdue`;
}
