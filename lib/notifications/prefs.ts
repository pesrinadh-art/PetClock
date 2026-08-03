import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted, user-editable notification preferences — quiet hours and per-pet mute. This is the
 * store the Settings screen (FE-5) WRITES and the scheduler/observer (FE-3) READ, replacing the
 * hardcoded `DEFAULT_NOTIFICATION_PREFS` so a quiet-hours window or a muted pet actually changes
 * what gets scheduled.
 *
 * Deliberately React-free (mirrors `snoozeStore.ts`): a cached AsyncStorage map with a tiny
 * subscribe seam, so it can be read from anywhere — the `NotificationPrefsProvider` layers a
 * reactive React context on top for the screens, while the raw accessor stays available to
 * non-React callers. `snoozedUntil` is intentionally NOT stored here; it lives in `snoozeStore`
 * (written headlessly by the push response handler) and is merged in at reconcile time.
 */
const KEY = 'pawclock:notif:prefs';

/** The persisted slice of `NotificationPrefs` (everything except the headless `snoozedUntil`). */
export type StoredNotificationPrefs = {
  /** "HH:MM" 24h, household-local. Null = no quiet hours. Suppresses break/meal pushes only. */
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  /** Pets with all notifications muted. */
  mutedPetIds: string[];
};

export const DEFAULT_STORED_PREFS: StoredNotificationPrefs = {
  quietHoursStart: null,
  quietHoursEnd: null,
  mutedPetIds: [],
};

type Listener = () => void;

let cache: StoredNotificationPrefs | null = null;
const listeners = new Set<Listener>();

function normalize(raw: unknown): StoredNotificationPrefs {
  const obj = (raw ?? {}) as Partial<StoredNotificationPrefs>;
  return {
    quietHoursStart: typeof obj.quietHoursStart === 'string' ? obj.quietHoursStart : null,
    quietHoursEnd: typeof obj.quietHoursEnd === 'string' ? obj.quietHoursEnd : null,
    mutedPetIds: Array.isArray(obj.mutedPetIds) ? obj.mutedPetIds.filter((x) => typeof x === 'string') : [],
  };
}

/** Read the stored prefs (hydrating from AsyncStorage on first access). */
export async function getStoredPrefs(): Promise<StoredNotificationPrefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_STORED_PREFS };
  } catch {
    cache = { ...DEFAULT_STORED_PREFS };
  }
  return cache;
}

async function persistAndNotify(next: StoredNotificationPrefs): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

/** Merge a partial patch over the current prefs, persist, and notify subscribers. */
export async function setStoredPrefs(patch: Partial<StoredNotificationPrefs>): Promise<StoredNotificationPrefs> {
  const current = await getStoredPrefs();
  await persistAndNotify(normalize({ ...current, ...patch }));
  return cache!;
}

/** Subscribe to any prefs change (e.g. from the Settings screen). Returns an unsubscribe fn. */
export function subscribePrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
