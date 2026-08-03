import * as Notifications from 'expo-notifications';
import {
  ANDROID_CHANNEL,
  CATEGORY,
  PUSH_PAYLOAD_VERSION,
  QUIET_HOURS_SUPPRESSED,
  type AppointmentPushData,
  type BreakPushData,
  type CategoryId,
  type MealPushData,
  type MedicationPushData,
  type NotificationKind,
  type PawClockPushData,
} from '../../shared/notificationContracts';
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import { getTodaysMeals, parseClockTime, predictBreak } from '../petSchedule';
import { safe } from './available';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Local extension of the frozen push payload
// ---------------------------------------------------------------------------

/**
 * Fields the LOCAL scheduler needs on top of the frozen contract payload. They ride alongside
 * the contract fields in `content.data`; the contract's `isPawClockPush` guard ignores extras,
 * so the SAME payload the SYNC-2 backend emits plugs into the same handler unchanged.
 */
export type LocalNotificationExtra = {
  /** expo-router path for deep-link tap-through (wired in the next wave). */
  url: string;
  /** Stable identity used to diff desired vs. already-scheduled notifications. */
  reconcileKey: string;
  /** Epoch ms this push is scheduled to fire. Read back at reconcile time — parsing the OS
   *  trigger record is platform-fiddly, so we carry the intended time in the payload. */
  fireAtMs: number;
};

export type ScheduledNotificationData = PawClockPushData & LocalNotificationExtra;
type BreakData = BreakPushData & LocalNotificationExtra;
type MealData = MealPushData & LocalNotificationExtra;
type MedData = MedicationPushData & LocalNotificationExtra;
type ApptData = AppointmentPushData & LocalNotificationExtra;

// In LOCAL mode there is no server-issued token; the response handler writes through the repo
// directly. At SYNC 2 the backend payload carries a real HS256 token and the same handler POSTs.
const LOCAL_ACTION_TOKEN = '';

// ---------------------------------------------------------------------------
// Desired notifications + preferences
// ---------------------------------------------------------------------------

export type DesiredNotification = {
  /** Stable key === `data.reconcileKey`. One desired notification per key. */
  key: string;
  fireAt: Date;
  title: string;
  body: string;
  categoryId: CategoryId;
  /** Android channel id (contract `ANDROID_CHANNEL`). */
  channelId: string;
  data: ScheduledNotificationData;
};

export type NotificationPrefs = {
  /** "HH:MM" 24h, household-local. Null = no quiet hours. Suppresses break/meal pushes only. */
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  /** Pets with all notifications muted. */
  mutedPetIds: string[];
  /** `reconcileKey` -> epoch ms; a snoozed nudge fires at this time instead of its natural time. */
  snoozedUntil: Record<string, number>;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  quietHoursStart: null,
  quietHoursEnd: null,
  mutedPetIds: [],
  snoozedUntil: {},
};

// ---------------------------------------------------------------------------
// Presentation — single source of copy/category/channel per payload, shared by the scheduler
// and the headless snooze re-ask so a snoozed re-ask reads identically to the original.
// ---------------------------------------------------------------------------

function presentation(data: ScheduledNotificationData): {
  title: string;
  body: string;
  categoryId: CategoryId;
  channelId: string;
} {
  switch (data.kind) {
    case 'break_prediction': {
      const emoji = data.breakType === 'pee' ? '💧' : '💩';
      const word = data.breakType === 'pee' ? 'pee' : 'poo';
      return {
        title: `Did ${data.petName} go? ${emoji}`,
        body: `Time for a ${word} break — tap to log it.`,
        categoryId: CATEGORY.break,
        channelId: ANDROID_CHANNEL.break_prediction.id,
      };
    }
    case 'meal':
      return {
        title: `${data.mealLabel} time 🍽️`,
        body: `Did ${data.petName} eat?`,
        categoryId: CATEGORY.meal,
        channelId: ANDROID_CHANNEL.meal.id,
      };
    case 'medication':
    case 'med_escalation':
      return {
        title: `${data.medicationName} 💊`,
        body: `Time for ${data.petName}'s medication${data.dosage ? ` (${data.dosage})` : ''}.`,
        categoryId: CATEGORY.medication,
        channelId:
          data.kind === 'med_escalation'
            ? ANDROID_CHANNEL.med_escalation.id
            : ANDROID_CHANNEL.medication.id,
      };
    case 'appointment':
      return {
        title: data.title,
        body: appointmentReminderBody(data.offsetMinutes),
        categoryId: CATEGORY.appointment,
        channelId: ANDROID_CHANNEL.appointment.id,
      };
  }
}

function appointmentReminderBody(offsetMinutes: number): string {
  if (offsetMinutes <= 0) return 'Starting now.';
  if (offsetMinutes < 60) return `In ${offsetMinutes} min.`;
  if (offsetMinutes < 1440) {
    const h = Math.round(offsetMinutes / 60);
    return `In ${h} hour${h === 1 ? '' : 's'}.`;
  }
  const d = Math.round(offsetMinutes / 1440);
  return d === 1 ? 'Tomorrow.' : `In ${d} days.`;
}

/** Deterministic id: no server row exists locally, so derive one from key + fire time (purity). */
function localNotificationId(key: string, fireAtMs: number): string {
  return `${key}@${fireAtMs}`;
}

/** Build the full DesiredNotification from a payload + fire time (fills the derived data fields). */
function toDesired(data: ScheduledNotificationData, fireAt: Date): DesiredNotification {
  const fireAtMs = fireAt.getTime();
  const full: ScheduledNotificationData = {
    ...data,
    fireAtMs,
    notificationId: localNotificationId(data.reconcileKey, fireAtMs),
  };
  const p = presentation(full);
  return {
    key: full.reconcileKey,
    fireAt,
    title: p.title,
    body: p.body,
    categoryId: p.categoryId,
    channelId: p.channelId,
    data: full,
  };
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseHHMM(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True if `date`'s wall-clock time falls in [start, end), handling an overnight window. */
function isInQuietHours(date: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null || s === e) return false;
  const t = minutesOfDay(date);
  return s < e ? t >= s && t < e : t >= s || t < e; // wrap past midnight
}

function isQuietSuppressed(kind: NotificationKind, fireAt: Date, prefs: NotificationPrefs): boolean {
  return (
    QUIET_HOURS_SUPPRESSED.includes(kind) &&
    isInQuietHours(fireAt, prefs.quietHoursStart, prefs.quietHoursEnd)
  );
}

// ---------------------------------------------------------------------------
// Pure computation — mirrors petSchedule (predictBreak + getTodaysMeals) plus meds + appts
// ---------------------------------------------------------------------------

function indexByPet<T extends { petId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.petId);
    if (list) list.push(item);
    else map.set(item.petId, [item]);
  }
  return map;
}

/**
 * PURE. Mirrors the on-screen predictions into desired scheduled notifications, each carrying the
 * frozen-contract payload. Because it derives entirely from (pets, feedTimes, medications, logs,
 * appointments, prefs, now), a new log changes `logs` → the observer reruns this → the pee/poo
 * desired notification moves to `lastLog + hold − buffer` → reconcile cancels the old and schedules
 * the new. That is how "reschedule after every log" falls out for free.
 *
 * Rules:
 *  - Breaks: the NEXT pee and NEXT poo per pet, fired at `predictedAt − buffer` (predictBreak).
 *  - Meals: one per still-upcoming, not-yet-done feed slot TODAY (getTodaysMeals).
 *  - Meds: next daily occurrence per active medication (rolls to tomorrow once today's time passes).
 *  - Appointments: one per reminder offset, fired at `startsAt − offset`.
 *  - Per-pet mute drops all of a pet's pushes; quiet hours drop break/meal only; a live snooze
 *    overrides the fire time; anything that would fire in the past is not scheduled.
 */
export function computeDesiredNotifications(
  pets: Pet[],
  feedTimes: FeedTime[],
  medications: Medication[],
  logs: LogEntry[],
  appts: Appointment[],
  prefs: NotificationPrefs,
  now: Date = new Date(),
): DesiredNotification[] {
  const nowMs = now.getTime();
  const muted = new Set(prefs.mutedPetIds);
  const feedByPet = indexByPet(feedTimes);
  const medsByPet = indexByPet(medications);
  const logsByPet = indexByPet(logs);
  const raw: DesiredNotification[] = [];

  for (const pet of pets) {
    if (pet.archivedAt || muted.has(pet.id)) continue;
    const fts = feedByPet.get(pet.id) ?? [];
    const petLogs = logsByPet.get(pet.id) ?? [];

    // --- Breaks (the flagship) — mirror predictBreak, the same kernel the UI window uses.
    for (const breakType of ['pee', 'poo'] as const) {
      const p = predictBreak(pet, fts, petLogs, breakType, now);
      if (!p) continue;
      const key = `break:${pet.id}:${breakType}`;
      const data: BreakData = {
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
        fireAtMs: 0,
      };
      raw.push(toDesired(data, p.notifyAt));
    }

    // --- Meals — one per still-upcoming, not-done slot today.
    for (const meal of getTodaysMeals(fts, now, petLogs)) {
      if (meal.status === 'done' || !meal.feedTimeId) continue;
      if (meal.time.getTime() <= nowMs) continue;
      const key = `meal:${pet.id}:${meal.feedTimeId}`;
      const data: MealData = {
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
        fireAtMs: 0,
      };
      raw.push(toDesired(data, meal.time));
    }

    // --- Medications — next daily occurrence per active med (rolls to tomorrow when today passed).
    for (const med of medsByPet.get(pet.id) ?? []) {
      if (!med.active) continue;
      const parsed = parseClockTime(med.localTime, now);
      if (!parsed) continue;
      const fireAt = parsed.getTime() > nowMs ? parsed : new Date(parsed.getTime() + DAY_MS);
      const key = `med:${pet.id}:${med.id}`;
      const data: MedData = {
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
        fireAtMs: 0,
      };
      raw.push(toDesired(data, fireAt));
    }
  }

  // --- Appointments — one reminder per configured offset.
  for (const appt of appts) {
    if (appt.deletedAt || appt.completedAt) continue;
    const startsAtMs = new Date(appt.startsAt).getTime();
    if (Number.isNaN(startsAtMs)) continue;
    for (const offsetMinutes of appt.reminderOffsetsMinutes) {
      const fireAt = new Date(startsAtMs - offsetMinutes * 60 * 1000);
      const key = `appt:${appt.id}:${offsetMinutes}`;
      const data: ApptData = {
        v: PUSH_PAYLOAD_VERSION,
        kind: 'appointment',
        notificationId: '',
        actionToken: LOCAL_ACTION_TOKEN,
        householdId: appt.householdId,
        petId: appt.petIds[0] ?? null,
        appointmentId: appt.id,
        title: appt.title,
        startsAt: appt.startsAt,
        offsetMinutes,
        url: `/appointments`,
        reconcileKey: key,
        fireAtMs: 0,
      };
      raw.push(toDesired(data, fireAt));
    }
  }

  // Finalize: apply snooze override, drop quiet-hours-suppressed and past fires, dedupe by key.
  const out: DesiredNotification[] = [];
  const seen = new Set<string>();
  for (const d of raw) {
    if (seen.has(d.key)) continue;
    const snoozeUntil = prefs.snoozedUntil[d.key];
    const fired = snoozeUntil && snoozeUntil > nowMs ? toDesired(d.data, new Date(snoozeUntil)) : d;
    if (fired.fireAt.getTime() <= nowMs) continue;
    if (isQuietSuppressed(fired.data.kind, fired.fireAt, prefs)) continue;
    seen.add(d.key);
    out.push(fired);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reconcile — diff desired vs. the OS's scheduled set; cancel stale, schedule missing
// ---------------------------------------------------------------------------

function isOurs(data: Record<string, unknown> | undefined): boolean {
  return !!data && Number(data.v) === PUSH_PAYLOAD_VERSION && typeof data.reconcileKey === 'string';
}

async function scheduleOne(d: DesiredNotification): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: d.title,
      body: d.body,
      categoryIdentifier: d.categoryId,
      data: d.data as unknown as Record<string, unknown>,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: d.fireAt,
      channelId: d.channelId,
    },
  });
}

/**
 * Reconcile the OS's scheduled notifications to match `desired`, exactly like React reconciles a
 * tree: keep what already matches (same key, fire time, and copy), cancel what no longer belongs
 * to `desired` or has moved, and schedule what's missing. No imperative "schedule the next one"
 * from call sites — the observer just re-runs compute+reconcile whenever inputs change.
 *
 * No-op on web / when the native module is unavailable (see `safe`).
 */
export async function reconcileNotifications(desired: DesiredNotification[]): Promise<void> {
  await safe('reconcileNotifications', async () => {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const desiredByKey = new Map(desired.map((d) => [d.key, d]));
    const keep = new Set<string>();

    for (const n of existing) {
      const data = n.content.data as Record<string, unknown> | undefined;
      if (!isOurs(data)) continue; // never touch notifications we didn't schedule
      const key = String(data!.reconcileKey);
      const d = desiredByKey.get(key);
      const unchanged =
        !!d &&
        !keep.has(key) &&
        Number(data!.fireAtMs) === d.fireAt.getTime() &&
        (n.content.title ?? '') === d.title &&
        (n.content.body ?? '') === d.body;
      if (unchanged) {
        keep.add(key);
      } else {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    const nowMs = Date.now();
    for (const d of desired) {
      if (keep.has(d.key)) continue;
      if (d.fireAt.getTime() <= nowMs) continue; // never schedule the past
      await scheduleOne(d);
    }
  });
}

/**
 * Headless snooze: persist the snooze so the next reconcile honors it, AND schedule the re-ask
 * follow-up right now. The direct schedule matters because a background action-tap wakes only the
 * response listener, not the React observer — so the "ask again later" push must be armed here.
 * The follow-up carries the SAME payload (fresh id/fire time) and identical copy via `presentation`.
 */
export async function scheduleSnoozeFollowup(
  data: ScheduledNotificationData,
  untilMs: number,
): Promise<void> {
  const desired = toDesired(data, new Date(untilMs));
  await safe('scheduleSnoozeFollowup', async () => {
    if (untilMs <= Date.now()) return;
    await scheduleOne(desired);
  });
}

/** Cancel every notification WE scheduled (utility for reset flows). No-op when unavailable. */
export async function cancelAllOurNotifications(): Promise<void> {
  await safe('cancelAllOurNotifications', async () => {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of existing) {
      if (isOurs(n.content.data as Record<string, unknown> | undefined)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  });
}
