import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRootNavigationState } from 'expo-router';
import { useAppointments } from '../context/AppointmentsContext';
import { useLogs } from '../context/LogsContext';
import { useNotificationPrefs } from '../context/NotificationPrefsContext';
import { usePets } from '../context/PetsContext';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import { notificationsSupported } from '../lib/notifications/available';
import { registerNotificationCategories } from '../lib/notifications/categories';
import { configureForegroundHandler } from '../lib/notifications/handler';
import { requestNotificationPermission } from '../lib/notifications/permissions';
// Importing this module registers the root-level response listener (side effect at import),
// so a cold-start notification tap is handled even before this component renders.
import { flushPendingNavigation, initResponseHandler } from '../lib/notifications/responseHandler';
import {
  computeDesiredNotifications,
  reconcileNotifications,
  type NotificationPrefs,
} from '../lib/notifications/scheduler';
import { getActiveSnoozes } from '../lib/notifications/snoozeStore';
import { repos } from '../lib/repo/types';

/**
 * Mirrors current pets / feed times / medications / logs / appointments into the OS's scheduled
 * notifications. Mounted once in `app/_layout.tsx` (sibling of `AutoCalibrator`), under the data
 * providers. Any change to those inputs → debounced compute + reconcile → a new log cancels the
 * stale pee/poo push and schedules the next one automatically ("reschedule after every log").
 *
 * Renders nothing. Fully inert on web / without notification permission — the app is unaffected.
 */
export function NotificationObserver() {
  const { pets } = usePets();
  const { logs } = useLogs();
  const { appointments } = useAppointments();
  // Feed times and medications are their own collections; subscribe directly so a schedule edit
  // re-reconciles too.
  const { items: feedTimes } = usePersistedCollection(repos.feedTimes);
  const { items: medications } = usePersistedCollection(repos.medications);
  // User-editable quiet hours / per-pet mute (FE-5 Settings). Reactive, so an edit re-reconciles
  // (it's in the effect deps below); replaces the old hardcoded DEFAULT_NOTIFICATION_PREFS.
  const { prefs: storedPrefs } = useNotificationPrefs();
  // Deep-link cold-start: a notification body-tap that LAUNCHED the app is handled at import time,
  // before the router exists, so its target url is stashed. Once the root navigator is mounted
  // (navState has a key) we replay it. Warm taps navigate immediately and no-op here.
  const navState = useRootNavigationState();

  // One-time engine setup: foreground handler, category buttons, permission primer, response
  // listener. All guarded/idempotent and safe on web.
  useEffect(() => {
    if (!notificationsSupported) return;
    configureForegroundHandler();
    initResponseHandler();
    void registerNotificationCategories();
    void requestNotificationPermission();
  }, []);

  // Replay any stashed cold-start deep link once the root navigator is ready.
  useEffect(() => {
    if (navState?.key) flushPendingNavigation();
  }, [navState?.key]);

  // Reconcile whenever the prediction inputs change (debounced) and on every foreground (so a
  // headless "Yes" write, a crossed quiet-hours boundary, or an elapsed snooze are picked up).
  useEffect(() => {
    if (!notificationsSupported) return;
    let cancelled = false;

    const run = async () => {
      const snoozedUntil = await getActiveSnoozes();
      if (cancelled) return;
      // Persisted quiet-hours/mute (Settings) merged with the headless snooze map.
      const prefs: NotificationPrefs = { ...storedPrefs, snoozedUntil };
      const desired = computeDesiredNotifications(
        pets,
        feedTimes,
        medications,
        logs,
        appointments,
        prefs,
        new Date(),
      );
      if (cancelled) return;
      await reconcileNotifications(desired);
    };

    const timer = setTimeout(() => void run(), 500);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [pets, feedTimes, medications, logs, appointments, storedPrefs]);

  return null;
}
