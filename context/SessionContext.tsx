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
import { getSupabaseClient, isSyncedModeEnabled } from '../lib/db/client';
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
};

type SessionValue = SessionState & {
  /**
   * Redeem an invite and move this device into that household.
   *
   * Throws `HouseholdError` on a bad code — the caller shows `.message` directly. Only
   * meaningful in synced mode; in local mode there is no household to join.
   */
  join(code: string): Promise<JoinResult>;
};

const SessionContext = createContext<SessionValue | null>(null);

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    householdId: null,
    // Local mode is ready instantly; synced mode flips ready once bootstrap settles.
    ready: !isSyncedModeEnabled(),
    error: null,
    synced: false,
  });

  // `join` needs the current user id without re-creating itself on every state change,
  // which would re-render every consumer of this context.
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSyncedModeEnabled()) return; // inert in local mode
    let live = true;

    (async () => {
      try {
        const client = getSupabaseClient();

        // 1. Restore or create an anonymous session.
        let session = (await client.auth.getSession()).data.session;
        if (!session) {
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        if (!session) throw new Error('No session after anonymous sign-in.');
        const userId = session.user.id;
        userIdRef.current = userId;

        // 2. Resolve the household id: cache → my_household_id() → create.
        //
        //    my_household_id() resolves `order by joined_at limit 1`. The previous inline
        //    query had no ORDER BY at all, so once a user belonged to two households
        //    (which SYNC-4's join flow makes possible) the app could open either one at
        //    random between launches.
        let householdId = await getCachedHouseholdId();

        //    The cache is a warm-start shortcut, not an authority. Validate it before
        //    trusting it: the household can be gone (deleted, or a staging reset) and the
        //    membership can lapse or be revoked, at which point the cached id names
        //    something this user cannot write to. Left unvalidated the app still boots and
        //    still reads (returning nothing), but every write fails RLS 42501 forever with
        //    no recovery path short of clearing app storage by hand — which is exactly how
        //    "add a pet" broke after staging was re-seeded.
        //
        //    `households_select` is `using (app.is_member(id))`, so a visible row IS the
        //    membership proof, and is_member honours member_expires_at — a lapsed walker
        //    fails here too. Only a clean "no row" invalidates: a transport error must not
        //    throw away a good id and strand a warm start behind a flaky network.
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

        if (!householdId) {
          const { data: resolved, error: rErr } = await client.rpc('my_household_id');
          if (rErr) throw rErr;
          householdId = (resolved as string | null) ?? null;
        }
        if (!householdId) {
          const { data: newId, error: cErr } = await client.rpc(
            'create_household_with_membership',
            { p_timezone: deviceTimezone() },
          );
          if (cErr) throw cErr;
          householdId = newId as string;
        }
        if (!householdId) throw new Error('Could not resolve a household id.');
        await setCachedHouseholdId(householdId);

        // 3. Hot-swap the repo to the synced impl and re-hydrate mounted collections.
        activateSyncedRepos(createSyncedRepos(client, householdId, userId));

        if (live) {
          setState({ session, householdId, ready: true, error: null, synced: true });
        }

        // 4. SYNC-2: register this device for server-sent push, which also hands
        //    scheduling to the backend so both sides don't fire the same reminder.
        //
        //    Deliberately AFTER `ready` and not awaited into the state above: the app is
        //    already usable, and every failure path inside is soft — a denied permission or
        //    a simulator simply leaves the device on local scheduling, still reminding.
        void registerPushToken(client, userId);
      } catch (e) {
        // Graceful fallback: stay on the working local repo, surface the reason.
        const message = e instanceof Error ? e.message : String(e);
        if (live) {
          setState({ session: null, householdId: null, ready: true, error: message, synced: false });
        }
      }
    })();

    return () => {
      live = false;
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

  const value = useMemo<SessionValue>(() => ({ ...state, join }), [state, join]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
