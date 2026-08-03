import { Platform } from 'react-native';

/**
 * Scheduled local notifications only exist on the native OS schedulers (iOS/Android).
 * On web — and in any environment where the native `expo-notifications` module is missing
 * (Expo Go past SDK 52, SSR, tests) — every entry point in this folder must be a safe no-op
 * so the rest of the app keeps launching. This is the single gate every call is routed through.
 */
export const notificationsSupported: boolean =
  Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Run a notifications call defensively: skip entirely on unsupported platforms, and swallow
 * (log in dev) any error from a missing native module so a notifications failure can never
 * crash the host app. Returns `undefined` when it did not run or threw.
 */
export async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (!notificationsSupported) return undefined;
  try {
    return await fn();
  } catch (err) {
    if (__DEV__) console.warn(`[notifications] ${label} failed`, err);
    return undefined;
  }
}
