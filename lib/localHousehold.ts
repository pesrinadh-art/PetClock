/**
 * SYNC-1 (pure-FE model migration): the frozen contract types require a
 * `householdId` on pets, logs and appointments, but this wave stays fully local
 * and offline — there is no auth, no Supabase, and no real household yet. Every
 * entity created on-device is stamped with this single fixed household id so the
 * shapes match the contract exactly; the synced repo (later SYNC-1 wave) will
 * replace it with the real household id from `create_household_with_membership`.
 */
export const LOCAL_HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000000';
