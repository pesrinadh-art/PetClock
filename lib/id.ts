import * as Crypto from 'expo-crypto';

/**
 * Mint a client-generated uuid v4. Per the frozen backend contract (CLAUDE.md),
 * every new entity id is a uuid v4 generated on the client — for logs it doubles
 * as the offline idempotency key, so it must be minted once per user action and
 * reused across retries. Uses expo-crypto's RFC-4122 v4 generator.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
