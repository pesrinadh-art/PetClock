import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SYNC-1 (pure-FE model migration): the frozen contract types require a
 * `householdId` on pets, logs and appointments, but local mode stays fully local
 * and offline — there is no auth, no Supabase, and no real household there. Every
 * entity created on-device in local mode is stamped with this single fixed
 * household id so the shapes match the contract exactly.
 *
 * In synced mode the real household id comes from `create_household_with_membership`
 * (or the caller's existing `household_members` row); `SessionContext` caches it
 * with the helpers below so a warm start can skip the network round-trip.
 */
export const LOCAL_HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000000';

/** AsyncStorage key for the resolved synced-mode household id. */
const KEY_HOUSEHOLD_ID = 'pawclock:householdId';

/** Read the cached synced household id, or null if one has never been resolved. */
export function getCachedHouseholdId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_HOUSEHOLD_ID);
}

/** Persist the resolved synced household id for warm starts. */
export function setCachedHouseholdId(id: string): Promise<void> {
  return AsyncStorage.setItem(KEY_HOUSEHOLD_ID, id);
}

/** Drop the cached household id (e.g. on sign-out / account switch). */
export function clearCachedHouseholdId(): Promise<void> {
  return AsyncStorage.removeItem(KEY_HOUSEHOLD_ID);
}
