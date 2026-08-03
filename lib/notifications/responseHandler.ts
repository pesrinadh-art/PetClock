import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { ACTION, isPawClockPush, type LoggableAction } from '../../shared/notificationContracts';
import { clientLogIdFor, isServerPush, postLogAction } from '../push/logAction';
import { logYes, occurredAtFor, REASK_NO_MS, snoozeNudge, SNOOZE_15_MS } from './actions';
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

  try {
    // SYNC-2: a backend push carries an actionToken and belongs on the server, where the
    // partner's device can see it too. Returns false when there is no token (a locally
    // scheduled notification) or when the call could not be completed — either way we fall
    // through to the local write below, so a tap is never simply lost.
    if (await tryServerAction(raw, data, action)) {
      await markProcessed(dedupeKey);
      return;
    }

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
    if (__DEV__) console.warn('[notifications] handleNotificationResponse failed', err);
  }
}

// ---------------------------------------------------------------------------
// SYNC-2 — routing a backend push to the server
// ---------------------------------------------------------------------------

const SERVER_ACTIONS: Record<string, LoggableAction> = {
  [ACTION.yes]: 'LOG_YES',
  [ACTION.no]: 'LOG_NO',
  [ACTION.snooze]: 'SNOOZE_15',
};

/**
 * Send this answer to `log-action`, if it belongs there.
 *
 * Returns true only when the server has definitively accepted the answer, so the caller can
 * stop. Returns false in every other case — no token, not an answerable action, or the call
 * failed — and the caller writes locally instead.
 *
 * That fallback is the important part. Losing a "Yes" because the network blipped on a walk
 * is exactly the failure this whole feature exists to prevent, and the local write is safe
 * to make: it carries the SAME deterministic id the server would have used, so when the
 * device next syncs the row reconciles rather than duplicating.
 */
async function tryServerAction(
  raw: unknown,
  data: ScheduledNotificationData,
  action: string,
): Promise<boolean> {
  if (!isServerPush(raw)) return false;

  const serverAction = SERVER_ACTIONS[action];
  // Body taps, OPEN and DISMISS have nothing to write; they fall through to navigation.
  if (!serverAction) return false;

  try {
    const clientLogId = await clientLogIdFor(raw.notificationId, serverAction);
    const outcome = await postLogAction({
      actionToken: raw.actionToken,
      action: serverAction,
      clientLogId,
      // The event's own time, not the moment the tap was finally processed — a cold-start
      // replay can land hours late and must still record when the pet actually went.
      occurredAt: serverAction === 'LOG_YES' ? occurredAtFor(data) : undefined,
    });

    switch (outcome.status) {
      case 'ok':
      case 'replayed':
        // 'replayed' means the partner answered first, or a manual log superseded this push.
        // The desired state already holds, so this is done — not an error.
        return true;
      case 'rejected':
        // Expired or invalid token. Retrying cannot help; fall back to the local write.
        if (__DEV__) console.warn('[push] log-action rejected:', outcome.reason);
        return false;
      case 'failed':
        if (__DEV__) console.warn('[push] log-action failed, writing locally:', outcome.reason);
        return false;
    }
  } catch (err) {
    if (__DEV__) console.warn('[push] log-action threw, writing locally', err);
    return false;
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
