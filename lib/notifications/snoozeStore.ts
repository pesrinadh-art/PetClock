import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted snooze state, keyed by a desired-notification `reconcileKey`. Written headlessly by
 * the response handler (LOG_NO / SNOOZE_15) and read back into `computeDesiredNotifications`
 * (via `NotificationPrefs.snoozedUntil`) so a snooze survives the next reconcile instead of being
 * clobbered by the pet's natural predicted time. React-free — the response handler runs with no
 * React mounted, so this cannot depend on any context.
 */
const KEY = 'pawclock:notif:snoozes';

/** `reconcileKey` -> epoch ms until which the nudge is snoozed. */
export type SnoozeMap = Record<string, number>;

let cache: SnoozeMap | null = null;

async function load(): Promise<SnoozeMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as SnoozeMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(cache ?? {}));
}

/** Snoozes still in the future relative to `now`, pruning any that have elapsed. */
export async function getActiveSnoozes(now: number = Date.now()): Promise<SnoozeMap> {
  const map = await load();
  const active: SnoozeMap = {};
  let changed = false;
  for (const [k, until] of Object.entries(map)) {
    if (until > now) active[k] = until;
    else changed = true;
  }
  if (changed) {
    cache = active;
    await persist();
  }
  return active;
}

export async function setSnooze(key: string, untilMs: number): Promise<void> {
  const map = await load();
  map[key] = untilMs;
  cache = map;
  await persist();
}

export async function clearSnooze(key: string): Promise<void> {
  const map = await load();
  if (key in map) {
    delete map[key];
    cache = map;
    await persist();
  }
}
