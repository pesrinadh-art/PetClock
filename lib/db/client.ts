import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from './types.gen';

/**
 * The lazily-constructed Supabase client for SYNC-1.
 *
 * It is NEVER built at import time — only when synced mode is actually entered
 * (`getSupabaseClient()` is first called from `SessionContext`). With the feature
 * flag off (the default) this module is inert, so a missing/blank env can never
 * break the working local-repo app; the env is validated only at the point of use.
 *
 * Config is exactly the Expo/React-Native recipe: AsyncStorage-backed session,
 * silent token refresh, persisted session, and `detectSessionInUrl: false`
 * (deep-linking, not URL hash, carries auth on native).
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Master switch — read once here so every caller agrees on the mode. */
export function isSyncedModeEnabled(): boolean {
  return process.env.EXPO_PUBLIC_USE_SUPABASE === 'true';
}

let client: SupabaseClient<Database> | null = null;

/**
 * Get (or lazily create) the singleton Supabase client. Throws a clear error only
 * when synced mode is genuinely being used but the env is not configured — never at
 * boot, so local mode is unaffected.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase env missing: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
        'in .env.local before enabling EXPO_PUBLIC_USE_SUPABASE=true. See .env.example.',
    );
  }

  client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // Pause/resume the refresh timer with app foreground state (Supabase RN recipe).
  // Web keeps its own timer; guarding to native avoids react-native-web edge cases.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }

  return client;
}
