import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { ACTION, isPawClockPush } from '../../shared/notificationContracts';
import { logYes, REASK_NO_MS, snoozeNudge, SNOOZE_15_MS } from './actions';
import { notificationsSupported } from './available';
import { type ScheduledNotificationData } from './scheduler';

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

// ---------------------------------------------------------------------------
// Deep-link tap-through — a body tap (DEFAULT_ACTION) or OPEN action carries `data.url`, an
// expo-router path (the `pawclock://` scheme is registered in app.json). A WARM tap navigates
// immediately; a COLD-START tap (the tap launched the app, so this runs at import time before the
// router mounts) stashes the url and `flushPendingNavigation()` replays it once the root navigator
// is ready. The headless Yes/No/Snooze actions never reach here — they must NOT open the app.
// ---------------------------------------------------------------------------

let pendingNavUrl: string | null = null;

function tryNavigate(url: string): boolean {
  try {
    // `navigate` before the root navigator mounts throws; caught below so we retry on ready.
    router.navigate(url as Parameters<typeof router.navigate>[0]);
    return true;
  } catch {
    return false;
  }
}

/** Replay a stashed cold-start deep link. Call once the root navigator is mounted (idempotent). */
export function flushPendingNavigation(): void {
  if (pendingNavUrl && tryNavigate(pendingNavUrl)) pendingNavUrl = null;
}

function requestNavigation(url: string): void {
  pendingNavUrl = url;
  flushPendingNavigation();
}

/**
 * Map a notification response to a domain mutation — HEADLESS-SAFE: it writes through `repos`
 * directly (no React context, via the shared `actions` module), so a lock-screen tap logs even
 * with the app killed. The repo's `subscribe` then propagates the write to the UI on the next
 * foreground.
 *
 * Yes → repo write. Not-yet / Snooze → persist a snooze + arm the re-ask. Body tap / OPEN →
 * deep-link to `data.url`. DISMISS → nothing.
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
  // Reserve the key SYNCHRONOUSLY, before awaiting the action. A cold-start
  // getLastNotificationResponseAsync() and the live listener can deliver the SAME response;
  // marking only after the awaited write leaves a window where the second delivery passes the
  // has() check and double-writes the log. Reserving up front closes that race.
  processedMem.add(dedupeKey);

  try {
    switch (action) {
      case ACTION.yes:
        await logYes(data);
        break;
      case ACTION.no:
        await snoozeNudge(data, Date.now() + REASK_NO_MS);
        break;
      case ACTION.snooze:
        await snoozeNudge(data, Date.now() + SNOOZE_15_MS);
        break;
      case ACTION.dismiss:
        // User swiped it away — no write, no navigation.
        break;
      default:
        // DEFAULT_ACTION_IDENTIFIER (body tap) / OPEN — opens the app; deep-link tap-through.
        if (typeof data.url === 'string' && data.url) requestNavigation(data.url);
        break;
    }
    await markProcessed(dedupeKey);
  } catch (err) {
    // The action failed — release the reservation so a later relaunch can retry it.
    processedMem.delete(dedupeKey);
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
