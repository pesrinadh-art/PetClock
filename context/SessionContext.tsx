import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { getSupabaseClient, isSyncedModeEnabled } from '../lib/db/client';
import {
  completeAuthFromLink,
  completeAuthFromUrl,
  secureAccount as secureAccountApi,
  sendEmailOtp as sendEmailOtpApi,
  signInWithEmail as signInWithEmailApi,
  verifyEmailOtp as verifyEmailOtpApi,
} from '../lib/auth/account';
import { joinHousehold as joinHouseholdRpc, type JoinResult } from '../lib/household/invites';
import {
  clearCachedHouseholdId,
  getCachedHouseholdId,
  setCachedHouseholdId,
} from '../lib/localHousehold';
import { registerPushToken } from '../lib/push/registerToken';
import { createSyncedRepos } from '../lib/repo/synced';
import { activateSyncedRepos } from '../lib/repo/types';

/**
 * SYNC-1 session + household bootstrap, extended in SYNC-4 with the join flow and in
 * Phase-2 with MANDATORY email + 6-digit-code (OTP) onboarding.
 *
 * Mounted ABOVE the data providers. When synced mode is OFF it is completely inert —
 * `ready` flips true immediately and the app runs on the local repo exactly as before.
 *
 * When synced mode is ON, first launch REQUIRES a verified email. The bootstrap no longer
 * silently creates an anonymous user; if there is no verified (non-anonymous) session it
 * surfaces `needsAuth: true` and `OnboardingGate` forces the email → code flow before the
 * tabs. On a verified session (warm start, or right after the user types a correct code) it,
 * in order: (1) resolves the caller's `household_id`, creating one if none exists;
 * (2) caches the id for warm starts; (3) hot-swaps `repos` to the synced impl;
 * (4) registers for push. `needsAuth` flips false only once that household is live.
 *
 * DEV-ONLY escape: with `EXPO_PUBLIC_AUTH_DEV_BYPASS === 'true'` (default unset = OFF) the
 * old zero-friction anonymous bootstrap is restored so the redesign is previewable before
 * BE SMTP is confirmed. Production (unset) is mandatory OTP. This is NOT a user-facing skip.
 *
 * Any failure — RPC error, offline — is captured in `error`; it never crashes.
 */

/**
 * DEV-ONLY bypass of mandatory OTP. Read once at module load. When true, first launch falls
 * back to the pre-Phase-2 anonymous bootstrap so the app can be entered without email
 * delivery. MUST stay unset in production — see the task report. This is not the (nonexistent)
 * user-facing "skip"; it is an env-gated developer preview switch only.
 */
const AUTH_DEV_BYPASS = process.env.EXPO_PUBLIC_AUTH_DEV_BYPASS === 'true';

type SessionState = {
  session: Session | null;
  householdId: string | null;
  /** True once bootstrap has settled (whether it succeeded, fell back, or was skipped). */
  ready: boolean;
  /** Non-null when synced bootstrap failed; the app is running on the local repo. */
  error: string | null;
  /** Whether the synced repo is actually active (vs. the local fallback). */
  synced: boolean;
  /**
   * True while the user is on the zero-friction anonymous default (no email attached yet).
   * Derived from `session.user.is_anonymous`; flips to false once a secured email is
   * confirmed or the user signs in with email.
   */
  isAnonymous: boolean;
  /** The permanent account's email, once one is attached and confirmed; null while anonymous. */
  email: string | null;
  /**
   * Phase-2 mandatory OTP: true when synced mode is on, the DEV bypass is off, and there is
   * no verified (non-anonymous) session with a live household yet. While true, `OnboardingGate`
   * forces the email → code flow and blocks the tabs. Always false in local mode and whenever
   * the DEV bypass is set. Flips false only once a verified session's household is resolved and
   * the synced repo is active.
   */
  needsAuth: boolean;
};

type SessionValue = SessionState & {
  /**
   * Redeem an invite and move this device into that household.
   *
   * Throws `HouseholdError` on a bad code — the caller shows `.message` directly. Only
   * meaningful in synced mode; in local mode there is no household to join.
   */
  join(code: string): Promise<JoinResult>;
  /**
   * Attach an email to the current anonymous user, converting it to a permanent account IN
   * PLACE (same user id / household / data) and sending a confirmation email. Resolves once
   * the request is accepted; the account only becomes permanent after the link is clicked,
   * at which point the auth listener updates `isAnonymous`/`email`. Throws `AccountError`.
   */
  secureAccount(email: string): Promise<void>;
  /**
   * Send a magic link to recover an existing account onto THIS device. When the resulting
   * session arrives (link clicked), the auth listener re-resolves the household and swaps the
   * repo. Throws `AccountError`.
   */
  signInWithEmail(email: string): Promise<void>;
  /**
   * Phase-2 mandatory OTP, step 1: send a 6-digit code to `email` (creates the account if
   * needed). Throws `AccountError`; `EMAIL_SEND_FAILED` covers the SMTP-not-configured case
   * so the email screen shows "couldn't send a code, try again".
   */
  sendEmailCode(email: string): Promise<void>;
  /**
   * Phase-2 mandatory OTP, step 2: verify the 6-digit `code` for `email`. On success this
   * resolves/creates the household and activates the synced repo BEFORE it resolves, so the
   * caller can rely on `needsAuth` being false afterwards. Throws `AccountError`
   * (`CODE_INVALID` / `CODE_EXPIRED`).
   *
   * `name` (optional) is the display name captured on the first onboarding screen. On success
   * it is best-effort stored on the auth user (`full_name`) and, when this call CREATES the
   * household, used to name it (`${name}'s Household`). An empty name is treated as absent.
   */
  verifyEmailCode(email: string, code: string, name?: string): Promise<void>;
};

const isAnonymousUser = (session: Session | null): boolean =>
  session?.user?.is_anonymous === true;

/** Permanent email if the user has one, else null (anonymous users have no usable email). */
const emailOf = (session: Session | null): string | null => {
  if (!session?.user || session.user.is_anonymous) return null;
  return session.user.email ?? null;
};

/**
 * Whether this session is allowed to enter the app.
 * - Mandatory mode (default): only a verified, non-anonymous session qualifies.
 * - DEV bypass: any session (including anonymous) qualifies, restoring the old flow.
 */
const canEnterApp = (session: Session | null): boolean => {
  if (!session) return false;
  if (AUTH_DEV_BYPASS) return true;
  return !isAnonymousUser(session);
};

const SessionContext = createContext<SessionValue | null>(null);

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
};

type SupabaseClientT = ReturnType<typeof getSupabaseClient>;

/**
 * Resolve this user's household, cache it, and hot-swap the synced repo to it. Extracted so
 * the initial bootstrap AND an account switch (email recovery via the auth listener) share
 * exactly one code path — the resolution rules must not drift between the two.
 *
 * `freshUser` skips the warm-start cache: after recovery the cached id names the PREVIOUS
 * account's household, which this new user cannot write to, so resolve from scratch via
 * `my_household_id()`.
 */
async function resolveAndActivateHousehold(
  client: SupabaseClientT,
  userId: string,
  freshUser: boolean,
  householdName?: string,
): Promise<string> {
  let householdId: string | null = null;

  if (freshUser) {
    await clearCachedHouseholdId();
  } else {
    householdId = await getCachedHouseholdId();
    // The cache is a warm-start shortcut, not an authority — validate before trusting it.
    // A visible row IS the membership proof (households_select is `using app.is_member(id)`);
    // only a clean "no row" invalidates, never a transport error.
    if (householdId) {
      const { data: stillMine, error: vErr } = await client
        .from('households')
        .select('id')
        .eq('id', householdId)
        .maybeSingle();
      if (!vErr && !stillMine) {
        await clearCachedHouseholdId();
        householdId = null;
      }
    }
  }

  if (!householdId) {
    const { data: resolved, error: rErr } = await client.rpc('my_household_id');
    if (rErr) throw rErr;
    householdId = (resolved as string | null) ?? null;
  }
  if (!householdId) {
    // Only a first CREATE names the household. Joining or resolving an existing one above
    // returns before here, so an established household's name is never overwritten. When no
    // name was captured (empty, DEV bypass, local recovery) omit p_name and take the default.
    const trimmedName = householdName?.trim();
    const { data: newId, error: cErr } = await client.rpc('create_household_with_membership', {
      p_timezone: deviceTimezone(),
      ...(trimmedName ? { p_name: `${trimmedName}'s Household` } : {}),
    });
    if (cErr) throw cErr;
    householdId = newId as string;
  }
  if (!householdId) throw new Error('Could not resolve a household id.');

  await setCachedHouseholdId(householdId);
  activateSyncedRepos(createSyncedRepos(client, householdId, userId));
  return householdId;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    householdId: null,
    // Local mode is ready instantly; synced mode flips ready once bootstrap settles.
    ready: !isSyncedModeEnabled(),
    error: null,
    synced: false,
    isAnonymous: false,
    email: null,
    // Unknown until bootstrap settles; the gate waits for `ready` before acting on it.
    needsAuth: false,
  });

  // `join` needs the current user id without re-creating itself on every state change,
  // which would re-render every consumer of this context.
  const userIdRef = useRef<string | null>(null);

  // Set while `verifyEmailCode` is resolving the household itself. verifyOtp emits SIGNED_IN
  // synchronously during that await, and we must NOT let the auth listener kick off a SECOND,
  // racing `resolveAndActivateHousehold` for the same new user id. The listener skips its
  // switch branch while this is true; verifyEmailCode owns the resolution end-to-end.
  const manualSwitchInProgress = useRef(false);

  useEffect(() => {
    if (!isSyncedModeEnabled()) return; // inert in local mode
    let live = true;
    // Gate the listener until the initial bootstrap has claimed a user id. Otherwise the
    // INITIAL_SESSION event (which fires on subscribe) can arrive before the id is set on a
    // warm start and be mistaken for an account switch, needlessly clearing the cache.
    let initialBootDone = false;
    const client = getSupabaseClient();

    const switchToUser = async (userId: string, freshUser: boolean): Promise<void> => {
      const householdId = await resolveAndActivateHousehold(client, userId, freshUser);
      if (live) {
        // needsAuth clears HERE — only once the verified session's household is live and the
        // synced repo is active — so the gate never lets the tabs render on a half-booted state.
        setState((prev) => ({
          ...prev,
          householdId,
          ready: true,
          error: null,
          synced: true,
          needsAuth: false,
        }));
      }
      void registerPushToken(client, userId);
    };

    // React to email confirmation / recovery sign-in / token refresh. USER_UPDATED (after a
    // secureAccount confirmation) keeps the same user id, so it only refreshes the derived
    // fields. A genuinely NEW permanent user id (magic-link recovery on this device) is an
    // account switch and re-resolves the household.
    const { data: authSub } = client.auth.onAuthStateChange((_event, session) => {
      if (!live) return;

      // Always reflect the session-derived fields so Settings updates the moment the
      // account becomes permanent.
      setState((prev) => ({
        ...prev,
        session,
        isAnonymous: isAnonymousUser(session),
        email: emailOf(session),
      }));

      if (!initialBootDone) return; // initial boot owns the first resolution
      // `verifyEmailCode` resolves the household itself; don't race it with a second switch.
      if (manualSwitchInProgress.current) return;

      const newUserId = session?.user?.id ?? null;
      // Only a session ALLOWED to enter the app drives a household switch. In mandatory mode
      // that excludes anonymous sessions (e.g. a leftover anon session's token refresh must
      // never silently activate the synced repo and bypass the email gate).
      if (canEnterApp(session) && newUserId && newUserId !== userIdRef.current) {
        userIdRef.current = newUserId;
        void switchToUser(newUserId, true).catch((e) => {
          const message = e instanceof Error ? e.message : String(e);
          if (live) setState((prev) => ({ ...prev, error: message }));
        });
      } else if (!canEnterApp(session)) {
        // Signed out, or dropped back to an anonymous/absent session in mandatory mode:
        // re-block the app until a verified session lands.
        userIdRef.current = null;
        if (live) {
          setState((prev) => ({
            ...prev,
            synced: false,
            needsAuth: isSyncedModeEnabled() && !AUTH_DEV_BYPASS,
          }));
        }
      }
    });

    // NATIVE warm start: the magic link arrives as a `pawclock://` deep link while the app is
    // already running/backgrounded. Register the listener synchronously (before the async
    // bootstrap) so a link that lands mid-boot isn't dropped. A successful exchange emits
    // SIGNED_IN, and the `onAuthStateChange` handler above owns the household re-resolution —
    // this listener only hands the URL off, so there's no second resolve path to race.
    let linkSub: ReturnType<typeof Linking.addEventListener> | null = null;
    if (Platform.OS !== 'web') {
      linkSub = Linking.addEventListener('url', ({ url }) => {
        void completeAuthFromLink(client, url).catch(() => {
          /* completeAuthFromLink never throws; guard is belt-and-suspenders */
        });
      });
    }

    (async () => {
      try {
        // 0. If we landed on an auth redirect (magic link / confirmation), finish it before
        //    reading the session — the client won't process the URL itself
        //    (detectSessionInUrl: false).
        //    - Web: read the code/hash off `window.location`.
        //    - Native cold start: read `Linking.getInitialURL()` (the link that launched the
        //      app). Warm-start links are handled by the `url` listener registered above.
        //    Both are no-ops when there's no auth payload.
        if (Platform.OS === 'web') {
          await completeAuthFromUrl(client);
        } else {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) await completeAuthFromLink(client, initialUrl);
        }

        // 1. Read the existing session — but DO NOT blindly create one. Mandatory mode never
        //    auto-mints an anonymous user; that only happens under the DEV bypass.
        let session = (await client.auth.getSession()).data.session;

        const reflect = (s: Session) => {
          if (live) {
            setState((prev) => ({
              ...prev,
              session: s,
              isAnonymous: isAnonymousUser(s),
              email: emailOf(s),
            }));
          }
        };

        if (session && canEnterApp(session)) {
          // Verified warm start (or, under the DEV bypass, any restored session). Resolve the
          // household (cache → my_household_id() → create) and hot-swap the synced repo;
          // `ready`/`needsAuth` settle inside switchToUser on success.
          const userId = session.user.id;
          userIdRef.current = userId;
          reflect(session);
          await switchToUser(userId, false);
        } else if (AUTH_DEV_BYPASS) {
          // DEV-ONLY: no verified session, bypass on → restore the pre-Phase-2 anonymous
          // bootstrap so the redesign is previewable before BE SMTP is confirmed. This branch
          // is unreachable in production (bypass unset), where OTP is mandatory.
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
          if (!session) throw new Error('No session after anonymous sign-in.');
          const userId = session.user.id;
          userIdRef.current = userId;
          reflect(session);
          await switchToUser(userId, false);
        } else {
          // MANDATORY, no verified session (either none, or a leftover anonymous one). Do NOT
          // create an anonymous user. Surface `needsAuth` so OnboardingGate forces the
          // email → code flow before the tabs. `ready` still flips so the auth screen renders.
          userIdRef.current = null;
          if (live) {
            setState((prev) => ({
              ...prev,
              session,
              isAnonymous: isAnonymousUser(session),
              email: emailOf(session),
              householdId: null,
              ready: true,
              synced: false,
              error: null,
              needsAuth: true,
            }));
          }
        }
      } catch (e) {
        // Graceful fallback: never crash. In mandatory mode the email screen shows the error
        // and lets the user retry; under the DEV bypass this mirrors the old local fallback.
        const message = e instanceof Error ? e.message : String(e);
        if (live) {
          setState((prev) => ({
            ...prev,
            session: null,
            householdId: null,
            ready: true,
            error: message,
            synced: false,
            isAnonymous: false,
            email: null,
            needsAuth: isSyncedModeEnabled() && !AUTH_DEV_BYPASS,
          }));
        }
      } finally {
        // Either way the initial attempt has settled — let the listener handle any later
        // account switch (e.g. magic-link recovery arriving after boot).
        initialBootDone = true;
      }
    })();

    return () => {
      live = false;
      authSub?.subscription?.unsubscribe();
      linkSub?.remove();
    };
  }, []);

  /**
   * SYNC-4: move this device into the household behind `code`.
   *
   * The RPC redeems and leaves the auto-created household in ONE transaction (migration
   * 0016). Passing the current id is what stops the caller ending up in two households
   * with `my_household_id()` resolving to the empty one they started in.
   */
  const join = useCallback(async (code: string): Promise<JoinResult> => {
    const client = getSupabaseClient();
    const userId = userIdRef.current;
    if (!userId) throw new Error('No session yet.');

    // Errors propagate to the caller unchanged — HouseholdError already carries a message
    // written for a person typing a code from a text message.
    const result = await joinHouseholdRpc(client, code, state.householdId);

    // Cache BEFORE swapping: if the app is killed mid-swap, the next launch still opens the
    // joined household rather than falling back to a resolution that no longer applies.
    await setCachedHouseholdId(result.householdId);
    activateSyncedRepos(createSyncedRepos(client, result.householdId, userId));

    setState((prev) => ({ ...prev, householdId: result.householdId, synced: true, error: null }));
    return result;
  }, [state.householdId]);

  /**
   * ACCOUNTS: attach an email to the current anonymous user (upgrade in place). The
   * confirmation flips `isAnonymous`/`email` later via the auth listener; here we just
   * kick off the request and let `AccountError` propagate for the UI to render.
   */
  const secureAccount = useCallback(async (email: string): Promise<void> => {
    await secureAccountApi(getSupabaseClient(), email);
  }, []);

  /**
   * ACCOUNTS: send a magic link to recover an existing account onto this device. The session
   * (and household re-resolution) lands through the auth listener once the link is clicked.
   */
  const signInWithEmail = useCallback(async (email: string): Promise<void> => {
    await signInWithEmailApi(getSupabaseClient(), email);
  }, []);

  /**
   * MANDATORY OTP, step 1 — send the 6-digit code. Thin pass-through; `AccountError`
   * (incl. `EMAIL_SEND_FAILED` for missing SMTP) propagates to the email screen.
   */
  const sendEmailCode = useCallback(async (email: string): Promise<void> => {
    await sendEmailOtpApi(getSupabaseClient(), email);
  }, []);

  /**
   * MANDATORY OTP, step 2 — verify the code, then resolve the household and activate the
   * synced repo IN THIS CALL (not via the listener) so it is deterministic and `needsAuth`
   * is reliably false once it resolves. `manualSwitchInProgress` stops the auth listener from
   * racing a duplicate resolution off the SIGNED_IN event verifyOtp emits.
   */
  const verifyEmailCode = useCallback(async (email: string, code: string, name?: string): Promise<void> => {
    const client = getSupabaseClient();
    manualSwitchInProgress.current = true;
    try {
      await verifyEmailOtpApi(client, email, code);

      const session = (await client.auth.getSession()).data.session;
      const userId = session?.user?.id;
      if (!session || !userId || isAnonymousUser(session)) {
        throw new Error('Verification did not produce a verified session.');
      }
      userIdRef.current = userId;
      setState((prev) => ({
        ...prev,
        session,
        isAnonymous: false,
        email: emailOf(session),
      }));

      // Best-effort: stash the display name on the auth user. Never block entry on it — a
      // failure here (offline, provider hiccup) is swallowed so onboarding still completes.
      const trimmedName = name?.trim();
      if (trimmedName) {
        try {
          await client.auth.updateUser({ data: { full_name: trimmedName } });
        } catch {
          /* non-fatal — the household name below is the load-bearing use of the name */
        }
      }

      // Reuse the one household code path — freshUser:true (this is a brand-new verified user,
      // so the warm-start cache from any previous session must not be trusted). Pass the name
      // so a FIRST household create is named after the user; an existing/joined one is untouched.
      const householdId = await resolveAndActivateHousehold(client, userId, true, trimmedName);
      setState((prev) => ({
        ...prev,
        householdId,
        ready: true,
        error: null,
        synced: true,
        needsAuth: false,
      }));
      void registerPushToken(client, userId);
    } finally {
      manualSwitchInProgress.current = false;
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ ...state, join, secureAccount, signInWithEmail, sendEmailCode, verifyEmailCode }),
    [state, join, secureAccount, signInWithEmail, sendEmailCode, verifyEmailCode],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
