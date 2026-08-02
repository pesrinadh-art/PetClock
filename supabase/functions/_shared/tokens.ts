import { jwtVerify, SignJWT } from "npm:jose@5";
import { ACTION_TOKEN_SECRET } from "./env.ts";
import { HttpError } from "./supabase.ts";

/**
 * Action tokens: the thing that makes one-tap logging work with no live session.
 *
 * On iOS the OS may decline to wake a killed app, in which case the notification response
 * is queued and replayed on next launch — possibly hours later, when any cached Supabase
 * session is long gone. So the tap has to carry its own authority.
 *
 * Scope is deliberately tiny: HS256, 3h expiry, claims pinned to one notification, and
 * single-use via the compare-and-set in claim_notification(). A leaked token can log at
 * most one pee, for one pet, once, within three hours.
 */

export type ActionClaims = {
  /** notification id */
  nid: string;
  /** pet id (null for appointment reminders with no single subject) */
  pid: string | null;
  /** household id */
  hid: string;
  kind: string;
  breakType?: "pee" | "poo";
  feedTimeId?: string;
  medicationId?: string;
};

const key = () => new TextEncoder().encode(ACTION_TOKEN_SECRET());

export async function signActionToken(claims: ActionClaims): Promise<string> {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3h")
    .sign(key());
}

export async function verifyActionToken(token: string): Promise<ActionClaims> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.nid || !payload.hid) {
      throw new HttpError(401, "INVALID_TOKEN", "token missing required claims");
    }
    return payload as unknown as ActionClaims;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const expired = String(err).includes("exp");
    throw new HttpError(
      401,
      expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      expired
        ? "this notification is older than 3 hours"
        : "signature verification failed",
    );
  }
}
