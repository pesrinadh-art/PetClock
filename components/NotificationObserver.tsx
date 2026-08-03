import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppointments } from '../context/AppointmentsContext';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import { notificationsSupported } from '../lib/notifications/available';
import { registerNotificationCategories } from '../lib/notifications/categories';
import { configureForegroundHandler } from '../lib/notifications/handler';
import { requestNotificationPermission } from '../lib/notifications/permissions';
// Importing this module registers the root-level response listener (side effect at import),
// so a cold-start notification tap is handled even before this component renders.
import { initResponseHandler } from '../lib/notifications/responseHandler';
import {
  computeDesiredNotifications,
  DEFAULT_NOTIFICATION_PREFS,
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

  // One-time engine setup: foreground handler, category buttons, permission primer, response
  // listener. All guarded/idempotent and safe on web.
  useEffect(() => {
    if (!notificationsSupported) return;
    configureForegroundHandler();
    initResponseHandler();
    void registerNotificationCategories();
    void requestNotificationPermission();
  }, []);

  // Reconcile whenever the prediction inputs change (debounced) and on every foreground (so a
  // headless "Yes" write, a crossed quiet-hours boundary, or an elapsed snooze are picked up).
  useEffect(() => {
    if (!notificationsSupported) return;
    let cancelled = false;

    const run = async () => {
      const snoozedUntil = await getActiveSnoozes();
      if (cancelled) return;
      const prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, snoozedUntil };
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
  }, [pets, feedTimes, medications, logs, appointments]);

  return null;
}
