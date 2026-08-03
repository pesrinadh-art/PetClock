import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { newId } from '../id';
import { notificationsSupported } from '../notifications/available';
import { setServerPushActive } from './mode';

/**
 * SYNC-2: tell the backend where to send this household's pushes.
 *
 * Until a row exists in `notification_tokens`, the dispatcher runs every minute, finds due
 * predictions, writes its audit rows — and sends to nobody. The server has been reporting
 * `noRecipients` since BE-3 shipped for exactly this reason.
 */

const DEVICE_ID_KEY = 'pawclock:push:deviceId';

/**
 * A stable per-install id, so the row is UPDATED on token rotation instead of accumulating
 * a new row every launch. It is the conflict target of the upsert, and it is not a secret —
 * just an installation label — so AsyncStorage is the right place for it.
 */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = newId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function resolveProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Register this device for server-sent push, and hand scheduling over to the backend.
 *
 * Every failure path is soft: the app keeps its local schedule and the user keeps getting
 * reminders. Nothing here is allowed to block or break session bootstrap.
 */
export async function registerPushToken(
  client: SupabaseClient,
  userId: string,
): Promise<RegisterResult> {
  if (!notificationsSupported) {
    return fail('notifications are unavailable on this platform');
  }

  // Remote push needs real hardware. A simulator can display a local notification but can
  // never be issued an Expo push token, so this is a normal outcome in development.
  if (!Device.isDevice) {
    return fail('push requires a physical device');
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    return fail('no EAS projectId in app config — getExpoPushTokenAsync cannot be called');
  }

  try {
    // Do not re-prompt: FE-3 already primes permission. Asking again here would surface a
    // second dialog at an unrelated moment.
    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted
      ? existing
      : await Notifications.requestPermissionsAsync();
    if (!status.granted) {
      return fail('notification permission not granted');
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const deviceId = await getOrCreateDeviceId();

    const { error } = await client.from('notification_tokens').upsert(
      {
        user_id: userId,
        device_id: deviceId,
        expo_push_token: token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        app_version: Constants.expoConfig?.version ?? null,
        last_seen_at: new Date().toISOString(),
        // Clear any prior revocation: a token that was marked dead by check-receipts is
        // alive again if this install is presenting it now.
        revoked_at: null,
      },
      { onConflict: 'user_id,device_id' },
    );
    if (error) return fail(`token upsert failed: ${error.message}`);

    // Only now does the server own scheduling — a token exists for it to send to.
    setServerPushActive(true);
    return { ok: true, token };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

function fail(reason: string): RegisterResult {
  setServerPushActive(false);
  if (__DEV__) console.warn(`[push] staying on local scheduling — ${reason}`);
  return { ok: false, reason };
}

/**
 * Mark this device's token revoked. Call on sign-out, so a shared phone stops receiving a
 * household's reminders the moment its owner leaves.
 */
export async function revokePushToken(client: SupabaseClient, userId: string): Promise<void> {
  try {
    const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) return;
    await client
      .from('notification_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('device_id', deviceId);
  } catch {
    /* best effort — check-receipts will retire the token when it starts failing */
  } finally {
    setServerPushActive(false);
  }
}
