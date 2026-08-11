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
  signInWithEmail as signInWithEmailApi,
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
 * SYNC-1 session + household bootstrap, extended in SYNC-4 with the join flow.
 *
 * Mounted ABOVE the data providers. When synced mode is OFF it is completely inert —
 * `ready` flips true immediately and the app runs on the local repo exactly as before.
 *
 * When synced mode is ON it, in order: (1) restores or creates an anonymous session;
 * (2) resolves the caller's `household_id`, creating one if none exists; (3) caches the id
 * for warm starts; (4) hot-swaps `repos` to the synced impl; (5) registers for push.
 *
 * Any failure — anonymous sign-in disabled, offline, RPC error — is captured in `error`
 * and the app simply keeps running on the local repo. It never crashes and never blocks
 * the UI on the network: `ready` still flips true so screens render.
 */

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
};

const isAnonymousUser = (session: Session | null): boolean =>
  session?.user?.is_anonymous === true;

/** Permanent email if the user has one, else null (anonymous users have no usable email). */
const emailOf = (session: Session | null): string | null => {
  if (!session?.user || session.user.is_anonymous) return null;
  return session.user.email ?? null;
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
    const { data: newId, error: cErr } = await client.rpc('create_household_with_membership', {
      p_timezone: deviceTimezone(),
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
  });

  // `join` needs the current user id without re-creating itself on every state change,
  // which would re-render every consumer of this context.
  const userIdRef = useRef<string | null>(null);

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
        setState((prev) => ({ ...prev, householdId, ready: true, error: null, synced: true }));
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
      const newUserId = session?.user?.id ?? null;
      if (session && newUserId && newUserId !== userIdRef.current) {
        userIdRef.current = newUserId;
        void switchToUser(newUserId, true).catch((e) => {
          const message = e instanceof Error ? e.message : String(e);
          if (live) setState((prev) => ({ ...prev, error: message }));
        });
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

        // 1. Restore or create an anonymous session — the zero-friction default is unchanged.
        let session = (await client.auth.getSession()).data.session;
        if (!session) {
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        if (!session) throw new Error('No session after anonymous sign-in.');
        const userId = session.user.id;
        userIdRef.current = userId;

        if (live) {
          setState((prev) => ({
            ...prev,
            session,
            isAnonymous: isAnonymousUser(session),
            email: emailOf(session),
          }));
        }

        // 2–3. Resolve the household (cache → my_household_id() → create) and hot-swap the
        //       synced repo. `ready` flips inside on success.
        await switchToUser(userId, false);
      } catch (e) {
        // Graceful fallback: stay on the working local repo, surface the reason.
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

  const value = useMemo<SessionValue>(
    () => ({ ...state, join, secureAccount, signInWithEmail }),
    [state, join, secureAccount, signInWithEmail],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
