import type {
  LogActionRequest,
  LogActionResponse,
  LoggableAction,
} from '../../shared/notificationContracts';
import { getSupabaseClient, isSyncedModeEnabled } from '../db/client';
import { deterministicId } from '../id';

/**
 * SYNC-2 client half of the `log-action` endpoint.
 *
 * A push sent by the backend carries an `actionToken`. A notification this device scheduled
 * locally does not. That single field is how a tap is routed: token present means the write
 * belongs on the server, where BOTH caregivers' devices can see it.
 *
 * The token also carries its own authority, which is the whole point — on iOS the OS may
 * decline to wake a killed app and replay the response hours later, when any cached Supabase
 * session is long gone. So this call deliberately does NOT depend on being signed in.
 */

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;
const TIMEOUT_MS = 10_000;

export type LogActionOutcome =
  | { status: 'ok'; response: LogActionResponse }
  /** The server already had this answer — a partner tapped first, or a manual log superseded it. */
  | { status: 'replayed'; response: LogActionResponse }
  /** Token bad or expired. Retrying will never help; fall back to a local write. */
  | { status: 'rejected'; reason: string }
  /** Network or server trouble. Worth falling back to a local write. */
  | { status: 'failed'; reason: string };

/** True when this notification came from the backend rather than local scheduling. */
export function isServerPush(data: unknown): data is { actionToken: string; notificationId: string } {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.actionToken === 'string' && d.actionToken.length > 0;
}

/**
 * The idempotency key for this tap.
 *
 * Derived from the notification id and the action, NOT random — see `deterministicId`. A
 * replayed cold-start response must present the same uuid, or the server's primary-key gate
 * cannot tell a retry from a genuinely new log and writes a duplicate.
 */
export function clientLogIdFor(notificationId: string, action: string): Promise<string> {
  return deterministicId(`pawclock:log-action:${notificationId}:${action}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function postLogAction(input: {
  actionToken: string;
  action: LoggableAction;
  clientLogId: string;
  occurredAt?: string;
}): Promise<LogActionOutcome> {
  if (!isSyncedModeEnabled()) {
    return { status: 'failed', reason: 'synced mode is off' };
  }

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/log-action`;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !anonKey) {
    return { status: 'failed', reason: 'Supabase env not configured' };
  }

  const body: LogActionRequest = {
    actionToken: input.actionToken,
    action: input.action,
    clientLogId: input.clientLogId,
    occurredAt: input.occurredAt,
  };

  // Attach the user's session when one happens to exist, purely so the server can attribute
  // the action to a person. Its absence is expected and must never block the write.
  let authorization = `Bearer ${anonKey}`;
  try {
    const session = (await getSupabaseClient().auth.getSession()).data.session;
    if (session?.access_token) authorization = `Bearer ${session.access_token}`;
  } catch {
    /* no session — the action token still authorises the call */
  }

  let lastReason = 'unknown';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
          apikey: anonKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = (await res.json()) as LogActionResponse;
        // `replayed` is a SUCCESS: the desired end state holds, someone else just got there
        // first. Surfacing it as an error would make the two-caregiver case look broken.
        return { status: json.replayed ? 'replayed' : 'ok', response: json };
      }

      // 4xx other than 429 is a permanent verdict — a bad or expired token, or a malformed
      // request. Retrying wastes the user's battery and delays the fallback write.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const text = await res.text().catch(() => '');
        return { status: 'rejected', reason: `${res.status} ${text.slice(0, 120)}` };
      }

      lastReason = `http ${res.status}`;
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
    }

    if (attempt < MAX_ATTEMPTS) await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
  }

  return { status: 'failed', reason: lastReason };
}
