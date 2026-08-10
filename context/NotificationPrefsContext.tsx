import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_STORED_PREFS,
  getStoredPrefs,
  setStoredPrefs,
  subscribePrefs,
  type StoredNotificationPrefs,
} from '../lib/notifications/prefs';

/**
 * Reactive React layer over the React-free `lib/notifications/prefs` store. The Settings screen
 * writes through the setters here; the NotificationObserver reads `prefs` so a quiet-hours or mute
 * edit re-runs compute+reconcile immediately (prefs is in its effect deps). Any non-React caller
 * can still hit the raw store directly.
 */
type NotificationPrefsContextValue = {
  prefs: StoredNotificationPrefs;
  /** True once the stored prefs have been read from AsyncStorage. */
  hydrated: boolean;
  /** Pass null/null to clear quiet hours; both are "HH:MM" 24h. */
  setQuietHours: (start: string | null, end: string | null) => void;
  setPetMuted: (petId: string, muted: boolean) => void;
};

const NotificationPrefsContext = createContext<NotificationPrefsContextValue | null>(null);

// setStoredPrefs persists to AsyncStorage and can reject on a storage failure. The setters
// below fire it without awaiting, so an unguarded rejection would surface as an uncaught
// promise rejection the moment a user toggles a mute switch or picks a quiet-hours time —
// the most-clicked controls on the Settings screen. Guard the write here; persistence and
// the subscribe-driven in-memory refresh still run on the success path.
function persistPrefs(patch: Partial<StoredNotificationPrefs>): void {
  setStoredPrefs(patch).catch((err) => {
    if (__DEV__) console.warn('[NotificationPrefs] persist failed:', err);
  });
}

export function NotificationPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<StoredNotificationPrefs>(DEFAULT_STORED_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let live = true;
    getStoredPrefs().then((p) => {
      if (!live) return;
      setPrefs(p);
      setHydrated(true);
    });
    // Any write (from this or another consumer) re-pulls the cached prefs.
    const unsub = subscribePrefs(() => {
      void getStoredPrefs().then((p) => {
        if (live) setPrefs({ ...p });
      });
    });
    return () => {
      live = false;
      unsub();
    };
  }, []);

  const setQuietHours = useCallback((start: string | null, end: string | null) => {
    persistPrefs({ quietHoursStart: start, quietHoursEnd: end });
  }, []);

  const setPetMuted = useCallback(
    (petId: string, muted: boolean) => {
      const current = new Set(prefs.mutedPetIds);
      if (muted) current.add(petId);
      else current.delete(petId);
      persistPrefs({ mutedPetIds: [...current] });
    },
    [prefs.mutedPetIds],
  );

  const value = useMemo(
    () => ({ prefs, hydrated, setQuietHours, setPetMuted }),
    [prefs, hydrated, setQuietHours, setPetMuted],
  );

  return <NotificationPrefsContext.Provider value={value}>{children}</NotificationPrefsContext.Provider>;
}

export function useNotificationPrefs() {
  const ctx = useContext(NotificationPrefsContext);
  if (!ctx) throw new Error('useNotificationPrefs must be used within a NotificationPrefsProvider');
  return ctx;
}
