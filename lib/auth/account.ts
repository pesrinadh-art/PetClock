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
  // Mandatory-OTP onboarding (Phase-2): sending the code, and verifying it.
  | 'EMAIL_SEND_FAILED'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
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
  EMAIL_SEND_FAILED: "Couldn't send a code. Check the email and try again.",
  CODE_INVALID: "That code isn't right. Check it and try again.",
  CODE_EXPIRED: 'That code has expired. Send a new one and try again.',
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
  // OTP verification failures. "Token has expired or is invalid" contains "expired", so it
  // resolves to CODE_EXPIRED (prompt a resend) — the safe, actionable default.
  if (c === 'otp_expired' || m.includes('expired')) return 'CODE_EXPIRED';
  if (
    (c.includes('otp') || c === 'invalid_credentials' || m.includes('token') || m.includes('otp') || m.includes('code')) &&
    (m.includes('invalid') || c.includes('invalid'))
  ) {
    return 'CODE_INVALID';
  }
  // Email delivery / SMTP problems when *sending* a code (BE SMTP not yet confirmed).
  if (
    c === 'unexpected_failure' ||
    c === 'email_provider_disabled' ||
    m.includes('error sending') ||
    m.includes('confirmation email') ||
    m.includes('smtp')
  ) {
    return 'EMAIL_SEND_FAILED';
  }
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
 * MANDATORY-OTP ONBOARDING (Phase-2). Send a 6-digit one-time code to `email` so a
 * first-launch user can verify it and get a permanent, verified session. Unlike the
 * recovery `signInWithEmail`, this uses `shouldCreateUser: true` — the whole point of
 * first launch is to create the account if it doesn't exist yet.
 *
 * This is a passwordless CODE flow, not a magic-link flow: we deliberately omit
 * `emailRedirectTo` so nothing depends on deep-link handling. Whether the email arrives
 * as a 6-digit code vs. a link is a BE email-template concern (`{{ .Token }}` must be in
 * the template) — see the task report. On the client we always verify via `verifyEmailOtp`.
 *
 * Throws `AccountError`; `EMAIL_SEND_FAILED` specifically covers the "SMTP not configured"
 * case so the UI can show a readable "couldn't send a code, try again".
 */
export async function sendEmailOtp(
  client: SupabaseClient<Database>,
  email: string,
): Promise<void> {
  const trimmed = email.trim();
  if (!isEmailish(trimmed)) throw new AccountError('EMAIL_INVALID', MESSAGES.EMAIL_INVALID);

  const { error } = await client.auth.signInWithOtp({
    email: trimmed,
    options: { shouldCreateUser: true },
  });
  if (error) throw toError(error);
}

/**
 * Verify the 6-digit `token` the user typed for `email`. On success the Supabase client
 * holds a permanent, verified (non-anonymous) session and emits SIGNED_IN; the caller
 * (SessionContext) resolves the household and activates the synced repo.
 *
 * `type: 'email'` matches a `signInWithOtp`-issued code for both brand-new and returning
 * accounts. Throws `AccountError` — `CODE_INVALID` / `CODE_EXPIRED` are written for a person
 * re-typing a code.
 */
export async function verifyEmailOtp(
  client: SupabaseClient<Database>,
  email: string,
  token: string,
): Promise<void> {
  const trimmedEmail = email.trim();
  const trimmedToken = token.trim();
  if (!isEmailish(trimmedEmail)) throw new AccountError('EMAIL_INVALID', MESSAGES.EMAIL_INVALID);
  if (!/^\d{6}$/.test(trimmedToken)) throw new AccountError('CODE_INVALID', MESSAGES.CODE_INVALID);

  const { error } = await client.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedToken,
    type: 'email',
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

/** The auth payload we can pull off an incoming deep link, whatever shape it arrives in. */
type AuthLinkParams = {
  /** PKCE authorization code (query string). */
  code: string | null;
  /** Implicit-flow access token (usually the URL fragment). */
  accessToken: string | null;
  /** Implicit-flow refresh token (usually the URL fragment). */
  refreshToken: string | null;
};

/** Coerce an expo-linking query value (`string | string[] | undefined`) to a single string. */
function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return null;
}

/** Parse an `a=b&c=d` blob (query string or URL fragment) into a decoded key→value map. */
function parseKeyValues(blob: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!blob) return out;
  for (const pair of blob.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawVal = eq >= 0 ? pair.slice(eq + 1) : '';
    if (!rawKey) continue;
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch {
      out[rawKey] = rawVal;
    }
  }
  return out;
}

/**
 * Pull the auth params off a deep-link URL, tolerating every shape Supabase can hand back.
 *
 * We read BOTH the query string and the URL fragment because the two auth flows put the
 * payload in different places:
 *  - PKCE:     `pawclock:///?code=...`                    → query string
 *  - Implicit: `pawclock:///#access_token=...&refresh_token=...` → fragment
 *
 * expo-linking's `parse()` builds on `new URL()` and only ever reads the query string — it
 * silently drops the fragment — so a hand parse of the hash is not optional. We still run
 * `parse()` too, purely to benefit from its Expo-Go `--/` dev-URL handling, but only to fill
 * gaps the manual parse left.
 */
function extractAuthParams(url: string): AuthLinkParams {
  const params: Record<string, string> = {};

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const qIndex = beforeHash.indexOf('?');
  const query = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : '';
  // Query first, then fragment — the fragment is where tokens live, so it wins on overlap.
  Object.assign(params, parseKeyValues(query), parseKeyValues(fragment));

  try {
    const { queryParams } = Linking.parse(url);
    if (queryParams) {
      for (const key of ['code', 'access_token', 'refresh_token'] as const) {
        const v = firstString(queryParams[key]);
        if (v && !params[key]) params[key] = v;
      }
    }
  } catch {
    /* not a URL expo-linking can parse — the manual parse above already ran */
  }

  return {
    code: params.code ?? null,
    accessToken: params.access_token ?? null,
    refreshToken: params.refresh_token ?? null,
  };
}

/**
 * Finish a magic-link / confirmation landing on NATIVE (iOS/Android), where the callback
 * arrives as a `pawclock://` deep link through expo-linking rather than a browser URL. This
 * is the native counterpart to `completeAuthFromUrl` (which reads `window.location` and only
 * runs on web); the client runs with `detectSessionInUrl: false`, so nobody processes the
 * link unless we do it here.
 *
 * Handles both flow shapes:
 *  - PKCE: a `code` query param → `exchangeCodeForSession(code)` (the code_verifier stored on
 *    this device when the link was requested completes the exchange).
 *  - Implicit / token hash: `access_token` + `refresh_token` (fragment or query) →
 *    `setSession(...)`.
 *
 * Returns whether a session was established. It is always safe to call unconditionally: it
 * returns false (never throws) for a non-auth deep link or a missing URL, so ordinary
 * in-app deep links pass straight through untouched. On success the Supabase client emits a
 * SIGNED_IN event; SessionContext's `onAuthStateChange` listener owns everything after that
 * (household re-resolution), so this function deliberately does no more than set the session.
 */
export async function completeAuthFromLink(
  client: SupabaseClient<Database>,
  url: string | null | undefined,
): Promise<boolean> {
  if (!url) return false;

  const { code, accessToken, refreshToken } = extractAuthParams(url);
  if (!code && !(accessToken && refreshToken)) return false; // not an auth link — ignore

  try {
    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      return !error;
    }
    if (accessToken && refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return !error;
    }
    return false;
  } catch {
    return false;
  }
}

/** Human-readable reason for any thrown error, safe to show directly. */
export function accountErrorMessage(e: unknown): string {
  if (e instanceof AccountError) return e.message;
  return MESSAGES.UNKNOWN;
}
