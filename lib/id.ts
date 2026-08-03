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

/**
 * A uuid derived deterministically from `seed` — the same seed always yields the same id.
 *
 * SYNC-2 needs this for notification actions. `newId()` is wrong there: iOS may decline to
 * wake a killed app and replay the notification response on a LATER LAUNCH, at which point a
 * fresh random uuid would be a different primary key and the server would happily insert a
 * second log for the same tap. Seeding on `notificationId:action` means every replay of one
 * tap presents the identical id, so the server's primary-key gate recognises it as a retry.
 *
 * Shaped as a v4 uuid (version and variant nibbles forced) because the server column is
 * `uuid` and the contract says v4 — it is a name-based id wearing the right clothes, not a
 * claim of randomness.
 */
export async function deterministicId(seed: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed);
  const h = hex.slice(0, 32);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return (
    `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-` +
    `${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
  );
}
