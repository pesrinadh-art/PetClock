import * as Notifications from 'expo-notifications';
import { notificationsSupported } from './available';

let configured = false;

/**
 * Foreground presentation policy. When a scheduled notification fires while the app is in the
 * foreground we SUPPRESS the OS banner (`shouldShowBanner: false`) so the in-app NudgeBanner
 * (built in the next wave) can render the actionable card instead. It still lands in the
 * notification list, plays no sound, and touches no badge.
 *
 * Idempotent; no-op on web / when the native module is unavailable.
 */
export function configureForegroundHandler(): void {
  if (configured || !notificationsSupported) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch (err) {
    if (__DEV__) console.warn('[notifications] setNotificationHandler failed', err);
  }
}
