import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ANDROID_CHANNEL } from '../../shared/notificationContracts';
import { notificationsSupported, safe } from './available';

/**
 * 'unsupported' — web or no native module; the app runs, notifications are simply off.
 * 'undetermined' — never asked (or can still ask). 'denied' — user said no and won't be re-asked.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const IMPORTANCE: Record<string, Notifications.AndroidImportance> = {
  low: Notifications.AndroidImportance.LOW,
  default: Notifications.AndroidImportance.DEFAULT,
  high: Notifications.AndroidImportance.HIGH,
};

/**
 * Create one Android channel per push kind (contract `ANDROID_CHANNEL`) so users can tune each
 * category independently. No-op off Android / when unavailable. Channels are additive and
 * idempotent — re-creating with the same id updates the name only.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await safe('ensureNotificationChannels', async () => {
    for (const ch of Object.values(ANDROID_CHANNEL)) {
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name,
        importance: IMPORTANCE[ch.importance] ?? Notifications.AndroidImportance.DEFAULT,
      });
    }
  });
}

function toState(status: Notifications.NotificationPermissionsStatus): PermissionState {
  if (status.granted) return 'granted';
  if (status.canAskAgain) return 'undetermined';
  return 'denied';
}

/** Read the current permission WITHOUT prompting. */
export async function getNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  const status = await safe('getPermissionsAsync', () => Notifications.getPermissionsAsync());
  return status ? toState(status) : 'undetermined';
}

/**
 * Permission primer: ensure channels exist, then request permission (prompts at most once — if
 * the OS won't let us ask again we return the resolved state without prompting). Denial is
 * handled gracefully everywhere: the scheduler still computes and the in-app banner (next wave)
 * remains the fallback channel, so the app is fully usable without notification permission.
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  await ensureNotificationChannels();
  const existing = await safe('getPermissionsAsync', () => Notifications.getPermissionsAsync());
  if (existing?.granted) return 'granted';
  if (existing && !existing.canAskAgain) return 'denied';
  const status = await safe('requestPermissionsAsync', () =>
    Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    }),
  );
  return status ? toState(status) : 'undetermined';
}
