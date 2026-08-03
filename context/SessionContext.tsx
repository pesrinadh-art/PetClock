import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabaseClient, isSyncedModeEnabled } from '../lib/db/client';
import { getCachedHouseholdId, setCachedHouseholdId } from '../lib/localHousehold';
import { registerPushToken } from '../lib/push/registerToken';
import { createSyncedRepos } from '../lib/repo/synced';
import { activateSyncedRepos } from '../lib/repo/types';

/**
 * SYNC-1 session + household bootstrap.
 *
 * Mounted ABOVE the data providers. When synced mode is OFF it is completely inert —
 * `ready` flips true immediately and the app runs on the local repo exactly as before.
 *
 * When synced mode is ON it, in order: (1) restores or creates an anonymous session;
 * (2) resolves the caller's `household_id` from `household_members`, creating one via
 * `create_household_with_membership` (stamped with the device timezone) if none exists;
 * (3) caches the id for warm starts; (4) hot-swaps `repos` to the synced impl.
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

const SessionContext = createContext<SessionState | null>(null);

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

        // 2. Resolve the household id: cache → membership row → create.
        let householdId = await getCachedHouseholdId();
        if (!householdId) {
          const { data: member, error: mErr } = await client
            .from('household_members')
            .select('household_id')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();
          if (mErr) throw mErr;
          householdId = member?.household_id ?? null;
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

  const value = useMemo(() => state, [state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
