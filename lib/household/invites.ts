import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/types.gen';

/**
 * SYNC-4: the join flow.
 *
 * `create_invite` and `redeem_invite` shipped in BE-1 with 20 pgTAP assertions behind them,
 * and nothing in the app ever called them. Until it did, every device signed in
 * anonymously, found no membership, and created its OWN household — so two phones meant
 * two households and the shared prediction the whole product rests on was unreachable.
 *
 * `join_household` (migration 0016) redeems and leaves the auto-created household in one
 * transaction. Doing it as two client calls could fail between them and strand the user in
 * both, which is the ambiguous state the migration exists to prevent.
 */

export type InviteRole = Database['public']['Enums']['member_role'];

export interface Invite {
  code: string;
  /** ISO */
  expiresAt: string;
  maxUses: number;
  useCount: number;
}

/**
 * Why a call failed, in terms the UI can act on. The RPCs raise bare P0001 strings, and a
 * raw Postgres message is not something to put in front of someone typing a 6-character
 * code from a text message.
 */
export type HouseholdErrorCode =
  | 'INVITE_INVALID'
  | 'RATE_LIMITED'
  | 'NOT_A_MEMBER'
  | 'OWNER_REQUIRED'
  | 'LAST_OWNER_HAS_PETS'
  | 'LAST_OWNER_HAS_MEMBERS'
  | 'NOT_AUTHENTICATED'
  | 'OFFLINE'
  | 'UNKNOWN';

export class HouseholdError extends Error {
  constructor(readonly code: HouseholdErrorCode, message: string) {
    super(message);
    this.name = 'HouseholdError';
  }
}

const MESSAGES: Record<HouseholdErrorCode, string> = {
  INVITE_INVALID: "That code didn't work. It may have expired or already been used up.",
  RATE_LIMITED: 'Too many tries. Wait a little while and try again.',
  NOT_A_MEMBER: "You're not in a household yet.",
  OWNER_REQUIRED: 'Only the household owner can invite a dog walker.',
  LAST_OWNER_HAS_PETS: "You're the only owner. Move or remove the pets before leaving.",
  LAST_OWNER_HAS_MEMBERS: "You're the only owner. Make someone else an owner before leaving.",
  NOT_AUTHENTICATED: 'Sign-in is still starting up. Try again in a moment.',
  OFFLINE: "Couldn't reach the server. Check your connection and try again.",
  UNKNOWN: 'Something went wrong. Try again.',
};

/** Postgres raises these as bare P0001 strings, so match on the message body. */
function classify(raw: string): HouseholdErrorCode {
  const m = raw.toUpperCase();
  if (m.includes('RATE_LIMITED')) return 'RATE_LIMITED';
  if (m.includes('INVITE_INVALID')) return 'INVITE_INVALID';
  if (m.includes('LAST_OWNER_HAS_PETS')) return 'LAST_OWNER_HAS_PETS';
  if (m.includes('LAST_OWNER_HAS_MEMBERS')) return 'LAST_OWNER_HAS_MEMBERS';
  if (m.includes('NOT_A_MEMBER')) return 'NOT_A_MEMBER';
  if (m.includes('OWNER_REQUIRED')) return 'OWNER_REQUIRED';
  if (m.includes('NOT_AUTHENTICATED')) return 'NOT_AUTHENTICATED';
  // PostgREST surfaces a dropped connection as a fetch failure, not a Postgres code.
  if (m.includes('FETCH') || m.includes('NETWORK')) return 'OFFLINE';
  return 'UNKNOWN';
}

function toError(raw: string): HouseholdError {
  const code = classify(raw);
  return new HouseholdError(code, MESSAGES[code]);
}

/**
 * Mint a code for the other caregiver to type in. Server-side rate limit is 10 per
 * household per day, so the UI should reuse a live code rather than minting on every open.
 */
export async function createInvite(
  client: SupabaseClient<Database>,
  role: InviteRole = 'member',
): Promise<Invite> {
  const { data, error } = await client.rpc('create_invite', { p_role: role });
  if (error) throw toError(error.message);
  if (!data) throw toError('UNKNOWN');
  return {
    code: data.code,
    expiresAt: data.expires_at,
    maxUses: data.max_uses,
    useCount: data.use_count,
  };
}

export interface JoinResult {
  householdId: string;
  /**
   * False when the caller's previous household was kept — it still held pets, so leaving
   * would have stranded them. The user is legitimately in two households and the cached
   * id decides which one opens.
   */
  leftPrevious: boolean;
}

/**
 * Redeem a code and leave `previousHouseholdId` in the same transaction.
 *
 * Pass the household this device auto-created at first launch. Without it the caller stays
 * in both, and `my_household_id()` resolves `order by joined_at limit 1` — which is always
 * the auto-created one. The user would join successfully and still see an empty app.
 */
export async function joinHousehold(
  client: SupabaseClient<Database>,
  code: string,
  previousHouseholdId: string | null,
): Promise<JoinResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) throw toError('INVITE_INVALID');

  const { data, error } = await client.rpc('join_household', {
    p_code: trimmed,
    ...(previousHouseholdId ? { p_leave: previousHouseholdId } : {}),
  });
  if (error) throw toError(error.message);

  const result = data as { householdId?: string; leftPrevious?: boolean } | null;
  if (!result?.householdId) throw toError('UNKNOWN');
  return { householdId: result.householdId, leftPrevious: result.leftPrevious === true };
}

/** Leave a household outright. Refused server-side if it would strand pets or members. */
export async function leaveHousehold(
  client: SupabaseClient<Database>,
  householdId: string,
): Promise<void> {
  const { error } = await client.rpc('leave_household', { p_household_id: householdId });
  if (error) throw toError(error.message);
}

/** Human-readable reason for any thrown error, safe to show directly. */
export function householdErrorMessage(e: unknown): string {
  if (e instanceof HouseholdError) return e.message;
  return MESSAGES.UNKNOWN;
}
