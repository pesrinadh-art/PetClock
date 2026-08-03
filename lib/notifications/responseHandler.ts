import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ACTION, isPawClockPush } from '../../shared/notificationContracts';
import { repos } from '../repo/types';
import { notificationsSupported } from './available';
import { scheduleSnoozeFollowup, type ScheduledNotificationData } from './scheduler';
import { clearSnooze } from './snoozeStore';

// Contract timings: LOG_NO re-asks sooner than an explicit snooze.
const SNOOZE_15_MS = 15 * 60 * 1000; // SNOOZE_15
const REASK_NO_MS = 20 * 60 * 1000; // LOG_NO

// ---------------------------------------------------------------------------
// Dedupe — a cold-start getLastNotificationResponseAsync() and the live listener can both
// deliver the SAME response; without this the "Yes" tap would double-write the log. Keyed by
// (notification identifier + action), persisted so a relaunch never replays an old response.
// ---------------------------------------------------------------------------

const PROCESSED_KEY = 'pawclock:notif:processed';
const PROCESSED_CAP = 200;
const processedMem = new Set<string>();
let processedLoaded: Promise<void> | null = null;

function loadProcessed(): Promise<void> {
  if (!processedLoaded) {
    processedLoaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(PROCESSED_KEY);
        if (raw) for (const k of JSON.parse(raw) as string[]) processedMem.add(k);
      } catch {
        /* ignore — an empty set only risks a rare double-write, never a crash */
      }
    })();
  }
  return processedLoaded;
}

async function markProcessed(key: string): Promise<void> {
  processedMem.add(key);
  // Keep the persisted list bounded (most recent PROCESSED_CAP keys).
  const keys = Array.from(processedMem).slice(-PROCESSED_CAP);
  processedMem.clear();
  for (const k of keys) processedMem.add(k);
  try {
    await AsyncStorage.setItem(PROCESSED_KEY, JSON.stringify(keys));
  } catch {
    /* best-effort persistence */
  }
}

/** ISO for a Yes write: the event's own time (predicted / slot time), so a delayed cold-start
 *  replay lands the log when it happened, not when the tap was finally processed. */
function occurredAtFor(data: ScheduledNotificationData): string {
  if (data.kind === 'break_prediction') {
    const d = new Date(data.predictedAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const ms = Number(data.fireAtMs);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}

/** LOG_YES: write the log straight through the repo (React-free) and clear any snooze on it. */
async function handleYes(data: ScheduledNotificationData): Promise<void> {
  const occurredAt = occurredAtFor(data);
  const notificationId = typeof data.notificationId === 'string' ? data.notificationId : null;
  switch (data.kind) {
    case 'break_prediction':
      await repos.logs.add(data.petId, {
        type: data.breakType,
        occurredAt,
        source: 'notification_yes',
        notificationId,
      });
      break;
    case 'meal':
      await repos.logs.add(data.petId, {
        type: 'food',
        occurredAt,
        feedTimeId: data.feedTimeId,
        source: 'notification_yes',
        notificationId,
      });
      break;
    case 'medication':
    case 'med_escalation':
      await repos.logs.add(data.petId, {
        type: 'medication',
        occurredAt,
        medicationId: data.medicationId,
        source: 'notification_yes',
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
 * Map a notification response to a domain mutation — HEADLESS-SAFE: it writes through `repos`
 * directly (no React context), so a lock-screen tap logs even with the app killed. The repo's
 * `subscribe` then propagates the write to the UI on the next foreground.
 *
 * Yes → repo write. Not-yet / Snooze → persist a snooze + arm the re-ask. Body tap / OPEN /
 * DISMISS → nothing here (deep-link routing lands next wave; the path already rides in `data.url`).
 */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<void> {
  const raw = response?.notification?.request?.content?.data;
  if (!isPawClockPush(raw)) return;
  // Our locally-scheduled notifications carry the LocalNotificationExtra fields alongside the
  // contract payload; a SYNC-2 server push would too. Guard already confirmed the contract shape.
  const data = raw as unknown as ScheduledNotificationData;
  const action = response.actionIdentifier;

  const dedupeKey = `${response.notification.request.identifier}:${action}`;
  await loadProcessed();
  if (processedMem.has(dedupeKey)) return;

  try {
    switch (action) {
      case ACTION.yes:
        await handleYes(data);
        break;
      case ACTION.no:
        await scheduleSnoozeFollowup(data, Date.now() + REASK_NO_MS);
        break;
      case ACTION.snooze:
        await scheduleSnoozeFollowup(data, Date.now() + SNOOZE_15_MS);
        break;
      default:
        // DEFAULT_ACTION_IDENTIFIER (body tap) / OPEN / DISMISS — no headless write.
        break;
    }
    await markProcessed(dedupeKey);
  } catch (err) {
    if (__DEV__) console.warn('[notifications] handleNotificationResponse failed', err);
  }
}

// ---------------------------------------------------------------------------
// Root-level registration — runs at module load so a cold-start tap (which launched the app) is
// handled even before React mounts. Idempotent; no-op on web / when the module is unavailable.
// ---------------------------------------------------------------------------

let registered = false;

export function initResponseHandler(): void {
  if (registered || !notificationsSupported) return;
  registered = true;
  try {
    // The app may have been launched by tapping a notification: replay that response once.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => (r ? handleNotificationResponse(r) : undefined))
      .catch((err) => {
        if (__DEV__) console.warn('[notifications] getLastNotificationResponse failed', err);
      });
    // Live taps while the JS runtime is alive (including iOS background wakes).
    Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
  } catch (err) {
    if (__DEV__) console.warn('[notifications] initResponseHandler failed', err);
  }
}

// Register at import time. `components/NotificationObserver` imports this module from the root
// layout, so the listener is wired during the initial bundle evaluation.
initResponseHandler();
