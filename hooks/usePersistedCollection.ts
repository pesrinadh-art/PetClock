import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { EntityRepo } from '../lib/repo/types';

/**
 * The single hydration pattern every persisted context uses. On mount it pulls
 * the collection from the repo, subscribes for any later mutation (including
 * headless writes made outside React — FE-3), and re-pulls whenever the app
 * returns to the foreground. Returns the live items plus a `hydrated` flag the
 * splash gate reads.
 *
 * ── INTEGRATION RECIPE (Pets is the reference; replicate for Logs & Appointments) ──
 *
 *   import { usePersistedCollection } from '../hooks/usePersistedCollection';
 *   import { repos } from '../lib/repo/types';
 *
 *   export function XProvider({ children }) {
 *     // 1. State comes from the hook, NOT useState(seed...).
 *     const { items: xs, hydrated } = usePersistedCollection(repos.x);
 *
 *     // 2. Any in-memory-only selection (e.g. activePetId) stays in local useState.
 *
 *     // 3. Mutators call the repo and return; the subscription auto-refreshes state.
 *     //    Fire-and-forget with `void` — the repo persists + notifies; the hook re-pulls.
 *     const addX = useCallback((input) => {
 *       void repos.x.upsert({ id: mintId(), ...input });   // add: new id
 *     }, []);
 *     const updateX = useCallback((id, patch) => {
 *       const existing = xs.find((x) => x.id === id);
 *       if (existing) void repos.x.upsert({ ...existing, ...patch });
 *     }, [xs]);
 *     const removeX = useCallback((id) => { void repos.x.remove(id); }, []);
 *     // Collection-specific extras (repos.logs.add / removeForPet,
 *     // repos.appointments.removePetRef, repos.pets.deleteCascade) are called the same way.
 *
 *     // 4. Expose `hydrated` on the context value (Wave-3 splash gate reads it).
 *     const value = useMemo(() => ({ xs, hydrated, addX, updateX, removeX }),
 *       [xs, hydrated, addX, updateX, removeX]);
 *     return <XContext.Provider value={value}>{children}</XContext.Provider>;
 *   }
 */
export function usePersistedCollection<T extends { id: string }>(
  repo: EntityRepo<T>,
): { items: T[]; hydrated: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let live = true;
    const pull = () => {
      repo.list().then((next) => {
        if (live) setItems(next);
      });
    };

    // Initial hydration: pull, then flip `hydrated` so the splash gate can lift.
    repo.list().then((next) => {
      if (!live) return;
      setItems(next);
      setHydrated(true);
    });

    // Re-pull on any mutation (incl. headless writes from outside React).
    const unsubscribe = repo.subscribe(pull);
    // Re-pull when the app returns to the foreground (another process may have written).
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') pull();
    });

    return () => {
      live = false;
      unsubscribe();
      appStateSub.remove();
    };
  }, [repo]);

  return { items, hydrated };
}
