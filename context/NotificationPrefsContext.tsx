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
    void setStoredPrefs({ quietHoursStart: start, quietHoursEnd: end });
  }, []);

  const setPetMuted = useCallback(
    (petId: string, muted: boolean) => {
      const current = new Set(prefs.mutedPetIds);
      if (muted) current.add(petId);
      else current.delete(petId);
      void setStoredPrefs({ mutedPetIds: [...current] });
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
