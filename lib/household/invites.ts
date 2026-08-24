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
  | 'PERMISSION_DENIED'
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
  PERMISSION_DENIED: "That didn't go through. Only the household owner can do this.",
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

/**
 * One row of `household_members`, the only member facts the client can read. `members_select`
 * (migration 0006) exposes role + timestamps but NOT names or emails — auth.users is not
 * client-readable — so the UI identifies people by role, join date, and "(You)", not by name.
 */
export interface Member {
  userId: string;
  role: InviteRole;
  /** ISO, or null for a permanent (non-walker) member. Set for time-boxed walker access. */
  memberExpiresAt: string | null;
  /** ISO */
  joinedAt: string;
}

/**
 * List everyone in the household. Any member may read this (`members_select` =
 * `app.is_member`). Ordered oldest-first so the owner (created the household) reads at the top.
 */
export async function listMembers(
  client: SupabaseClient<Database>,
  householdId: string,
): Promise<Member[]> {
  const { data, error } = await client
    .from('household_members')
    .select('user_id, role, member_expires_at, joined_at')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });
  if (error) throw toError(error.message);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    role: r.role,
    memberExpiresAt: r.member_expires_at,
    joinedAt: r.joined_at,
  }));
}

/**
 * Remove another member. This is a direct delete — `members_delete` (migration 0006) permits
 * it only when the caller `app.is_owner(household_id)` (or is deleting their own row), so RLS,
 * not the client, enforces the permission. A blocked delete affects zero rows without raising
 * an error, so we ask PostgREST to return the deleted row and treat an empty result as a
 * refusal rather than reporting a phantom success.
 */
export async function removeMember(
  client: SupabaseClient<Database>,
  householdId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await client
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw toError(error.message);
  if (!data || data.length === 0) throw new HouseholdError('PERMISSION_DENIED', MESSAGES.PERMISSION_DENIED);
}

/**
 * Revoke an outstanding invite so its code stops working. `redeem_invite` checks
 * `revoked_at is null` (migration 0007), and `invites_update` (migration 0006) lets an editor
 * set it directly, so this is a plain update guarded by RLS — no RPC needed. As with
 * `removeMember`, a zero-row result means RLS refused the write, not that it succeeded.
 */
export async function revokeInvite(
  client: SupabaseClient<Database>,
  householdId: string,
  code: string,
): Promise<void> {
  const { data, error } = await client
    .from('household_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('household_id', householdId)
    .eq('code', code.trim().toUpperCase())
    .select('id');
  if (error) throw toError(error.message);
  if (!data || data.length === 0) throw new HouseholdError('PERMISSION_DENIED', MESSAGES.PERMISSION_DENIED);
}

/**
 * Read the household's display name. Any member may read the row (`households_select` =
 * `app.is_member`), so this is a plain select. Returns null when the row is missing, the name
 * is blank, or the read fails — the caller falls back to a generic label rather than erroring.
 */
export async function getHouseholdName(
  client: SupabaseClient<Database>,
  householdId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('households')
    .select('name')
    .eq('id', householdId)
    .maybeSingle();
  if (error || !data) return null;
  const trimmed = data.name?.trim();
  return trimmed ? trimmed : null;
}

/** Human-readable reason for any thrown error, safe to show directly. */
export function householdErrorMessage(e: unknown): string {
  if (e instanceof HouseholdError) return e.message;
  return MESSAGES.UNKNOWN;
}
