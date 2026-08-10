import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { Database } from '../db/types.gen';

/**
 * ACCOUNTS ("Option 1"): keep the zero-friction anonymous default, and let a user opt in to
 * attaching an email so the account is recoverable, plus sign back in with that email on a
 * fresh install / another device.
 *
 * This mirrors `lib/household/invites.ts`: a thin typed wrapper over the Supabase auth calls
 * with a small error taxonomy so Settings can show a sentence written for a person, not a
 * raw `AuthApiError`.
 *
 * Two flows:
 *  - `secureAccount(email)` → `updateUser({ email })`. This upgrades the CURRENT anonymous
 *    user to permanent IN PLACE — same user id, same household, same pets — and sends a
 *    confirmation email. `is_anonymous` stays true until the link is clicked; the auth-state
 *    listener in SessionContext flips it when confirmation lands.
 *  - `signInWithEmail(email)` → `signInWithOtp({ email })`. Recovery on a device that wants
 *    to BECOME that account. `shouldCreateUser: false` so a typo can't silently mint a new,
 *    empty account instead of recovering the real one.
 *
 * Because the client is built with `detectSessionInUrl: false`, the redirect landing has to
 * be finished by hand — see `completeAuthFromUrl`.
 */

export type AccountErrorCode =
  | 'EMAIL_INVALID'
  | 'EMAIL_IN_USE'
  | 'RATE_LIMITED'
  | 'NOT_AUTHENTICATED'
  | 'OFFLINE'
  | 'UNKNOWN';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode, message: string) {
    super(message);
    this.name = 'AccountError';
  }
}

const MESSAGES: Record<AccountErrorCode, string> = {
  EMAIL_INVALID: "That email doesn't look right. Check it and try again.",
  // Per the product decision we do NOT merge two accounts / households.
  EMAIL_IN_USE:
    'That email already belongs to another account. We can’t merge two accounts, so ' +
    'use a different email — or sign in with that email to switch this device to it.',
  RATE_LIMITED: 'Too many attempts. Wait a little while and try again.',
  NOT_AUTHENTICATED: 'Sign-in is still starting up. Try again in a moment.',
  OFFLINE: "Couldn't reach the server. Check your connection and try again.",
  UNKNOWN: 'Something went wrong. Try again.',
};

/**
 * Map an `AuthError` to our taxonomy. Supabase populates `.code` on modern releases
 * (e.g. `email_exists`, `over_email_send_rate_limit`); older builds only set `.message`, so
 * match both.
 */
function classify(code: string | undefined, raw: string): AccountErrorCode {
  const c = (code ?? '').toLowerCase();
  const m = raw.toLowerCase();
  if (c === 'email_exists' || c === 'user_already_exists') return 'EMAIL_IN_USE';
  if (
    m.includes('already been registered') ||
    m.includes('already registered') ||
    m.includes('already in use') ||
    m.includes('already exists')
  ) {
    return 'EMAIL_IN_USE';
  }
  if (c.includes('rate') || m.includes('rate limit') || m.includes('too many')) return 'RATE_LIMITED';
  if (c.includes('invalid_email') || m.includes('invalid email') || m.includes('unable to validate email')) {
    return 'EMAIL_INVALID';
  }
  if (m.includes('not authenticated') || m.includes('jwt') || m.includes('session')) return 'NOT_AUTHENTICATED';
  if (m.includes('fetch') || m.includes('network')) return 'OFFLINE';
  return 'UNKNOWN';
}

function toError(err: { code?: string; message: string }): AccountError {
  const code = classify(err.code, err.message);
  return new AccountError(code, MESSAGES[code]);
}

/** Cheap client-side email sanity check so obvious typos never hit the network. */
function isEmailish(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Where the confirmation / magic link should send the user back to.
 *
 * Web: the current origin, so the code/hash lands on the running app.
 * Native: the app scheme deep link (`pawclock://...`) via expo-linking.
 *
 * Returns `undefined` when it can't be resolved (e.g. SSR) — callers omit the option so the
 * call still succeeds and simply falls back to the provider's configured Site URL. Nothing
 * crashes when the redirect isn't configured yet.
 */
export function authRedirectTo(): string | undefined {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
      }
      return undefined;
    }
    return Linking.createURL('/');
  } catch {
    return undefined;
  }
}

/**
 * Attach `email` to the current (anonymous) user, converting it to a permanent account in
 * place. Same user id / household / data; a confirmation email is sent. Resolves once the
 * request is accepted — the account only becomes permanent after the user clicks the link.
 */
export async function secureAccount(
  client: SupabaseClient<Database>,
  email: string,
): Promise<void> {
  const trimmed = email.trim();
  if (!isEmailish(trimmed)) throw new AccountError('EMAIL_INVALID', MESSAGES.EMAIL_INVALID);

  const emailRedirectTo = authRedirectTo();
  const { error } = await client.auth.updateUser(
    { email: trimmed },
    emailRedirectTo ? { emailRedirectTo } : undefined,
  );
  if (error) throw toError(error);
}

/**
 * Send a magic link to `email` to recover that account onto THIS device. Does not create a
 * new account (`shouldCreateUser: false`): recovery means signing into an account that
 * already exists because it was secured earlier.
 */
export async function signInWithEmail(
  client: SupabaseClient<Database>,
  email: string,
): Promise<void> {
  const trimmed = email.trim();
  if (!isEmailish(trimmed)) throw new AccountError('EMAIL_INVALID', MESSAGES.EMAIL_INVALID);

  const emailRedirectTo = authRedirectTo();
  const { error } = await client.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: false,
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  if (error) throw toError(error);
}

/**
 * Finish a redirect landing on WEB, since the client runs with `detectSessionInUrl: false`
 * and will not process the callback itself.
 *
 * Handles both auth flow shapes so it works regardless of how the provider is configured:
 *  - PKCE: `?code=...` in the query string → `exchangeCodeForSession`.
 *  - Implicit (supabase-js default): `#access_token=...&refresh_token=...` in the hash →
 *    `setSession`.
 *
 * On success the querystring/hash is stripped so a refresh doesn't re-run it. Returns whether
 * a session was established. No-op (returns false) off web or when the URL carries no auth
 * payload — so it is always safe to call unconditionally at boot.
 *
 * NATIVE is not handled here: the deep link arrives through expo-linking while the app is
 * running, and wiring a `Linking` listener to call `exchangeCodeForSession` / `setSession`
 * is the piece that still needs the owner's redirect config before it can be tested. See the
 * task report.
 */
export async function completeAuthFromUrl(client: SupabaseClient<Database>): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || !window.location) return false;

  const { search, hash, origin, pathname } = window.location;
  const hasCode = /[?&]code=/.test(search);
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (!hasCode && !accessToken) return false;

  try {
    if (hasCode) {
      const { error } = await client.auth.exchangeCodeForSession(window.location.href);
      if (error) return false;
    } else if (accessToken && refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return false;
    } else {
      return false;
    }
    // Scrub the auth payload from the address bar so a reload is a clean start.
    try {
      window.history.replaceState({}, '', origin + pathname);
    } catch {
      /* history API unavailable — harmless */
    }
    return true;
  } catch {
    return false;
  }
}

/** Human-readable reason for any thrown error, safe to show directly. */
export function accountErrorMessage(e: unknown): string {
  if (e instanceof AccountError) return e.message;
  return MESSAGES.UNKNOWN;
}
