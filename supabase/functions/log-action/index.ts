/**
 * log-action — the one-tap write. Called when someone answers a push.
 *
 * This endpoint has to be safe under conditions the app cannot control:
 *
 *   - Both caregivers tap "Yes" within seconds of each other
 *   - The phone retries the request after a flaky-network timeout
 *   - Someone logged manually in the app between the push being sent and the tap
 *   - iOS declined to wake a killed app, so the response replays HOURS later
 *
 * Two gates make all four benign:
 *
 *   Gate 1 — claim_notification() compare-and-sets status 'sent' -> 'actioned'.
 *            Only one caller can win. A superseded or already-actioned row never matches.
 *   Gate 2 — the log's primary key is the CLIENT-generated uuid. A retry of the same tap
 *            re-inserts the same key and no-ops.
 *
 * Auth is the action token, not a session — see _shared/tokens.ts for why.
 */

import {
  adminClient,
  errorResponse,
  HttpError,
  tryResolveUser,
} from "../_shared/supabase.ts";
import { verifyActionToken } from "../_shared/tokens.ts";
import type {
  LogActionRequest,
  LogActionResponse,
} from "../../../shared/notificationContracts.ts";

const UNIQUE_VIOLATION = "23505";

const VALID_ACTIONS = new Set(["LOG_YES", "LOG_NO", "SNOOZE_15"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "BAD_REQUEST", "POST only");
    }

    const body = (await req.json().catch(() => null)) as LogActionRequest | null;
    if (!body?.actionToken || !body?.action) {
      throw new HttpError(400, "BAD_REQUEST", "actionToken and action are required");
    }
    if (!VALID_ACTIONS.has(body.action)) {
      throw new HttpError(400, "BAD_REQUEST", `unknown action: ${body.action}`);
    }

    const claims = await verifyActionToken(body.actionToken);
    const admin = adminClient();

    // Rate limit on the token subject, not the IP: a shared household behind one NAT must
    // not throttle itself, but a leaked token must not become a write amplifier.
    const { error: rlErr } = await admin.rpc("check_rate_limit_public", {
      p_key: `log-action:${claims.nid}`,
      p_limit: 30,
      p_window_seconds: 60,
    });
    if (rlErr && String(rlErr.message).includes("RATE_LIMITED")) {
      throw new HttpError(429, "RATE_LIMITED", "too many actions for this notification");
    }

    // Attribution only — never authorization. A foreground tap carries a session; one
    // replayed from a cold start hours later may not, and that must still work.
    const actionBy = await tryResolveUser(admin, req.headers.get("authorization"));

    // ---- GATE 1 ----------------------------------------------------------
    // Returns the claimed notification's uuid, or null if another caller got there first.
    //
    // The null check is deliberately `typeof === "string"` rather than plain truthiness.
    // This function used to return a composite type, and PostgREST serialized a NULL
    // composite as {id: null, ...} — a truthy object that made every caller look like a
    // winner and silently disabled this gate (see migration 0014). Checking the shape,
    // not just the truthiness, means a future return-type change fails loudly instead.
    const { data: claimedId, error: claimErr } = await admin.rpc("claim_notification", {
      p_notification_id: claims.nid,
      p_action: body.action,
      p_action_by: actionBy,
    });
    if (claimErr) {
      console.error("claim_notification failed", claimErr);
      throw new HttpError(500, "SERVER_ERROR");
    }

    const wonClaim = typeof claimedId === "string" && claimedId.length > 0;

    if (!wonClaim) {
      // Lost the claim. Either the partner answered first, or a manual in-app log
      // superseded this push. Both mean the desired end state already holds — so this is
      // a success, not an error. The client shows a neutral "already logged".
      return json({
        ok: true,
        logId: null,
        nextPrediction: await currentPrediction(admin, claims),
        replayed: true,
      });
    }

    // ---- Action handling --------------------------------------------------

    if (body.action === "SNOOZE_15") {
      if (claims.breakType && claims.pid) {
        await admin.rpc("snooze_break", {
          p_pet_id: claims.pid,
          p_break_type: claims.breakType,
          p_notification_id: claims.nid,
          p_minutes: 15,
        });
      }
      return json({
        ok: true,
        logId: null,
        nextPrediction: await currentPrediction(admin, claims),
        replayed: false,
      });
    }

    if (body.action === "LOG_NO") {
      // "Hasn't gone yet." Re-ask in 20 minutes and record the drift signal — three
      // consecutive NOs let nightly recalibration stretch the hold time.
      if (claims.breakType && claims.pid) {
        await admin.rpc("record_break_no", {
          p_pet_id: claims.pid,
          p_break_type: claims.breakType,
        });
      }
      return json({
        ok: true,
        logId: null,
        nextPrediction: await currentPrediction(admin, claims),
        replayed: false,
      });
    }

    // ---- LOG_YES: GATE 2 --------------------------------------------------

    if (!body.clientLogId || !UUID_RE.test(body.clientLogId)) {
      throw new HttpError(
        400,
        "BAD_REQUEST",
        "clientLogId must be a uuid v4 — it is the idempotency key, generate it once " +
          "per tap and reuse it across retries",
      );
    }

    const logType = resolveLogType(claims);
    if (!logType || !claims.pid) {
      throw new HttpError(400, "BAD_REQUEST", "this notification kind cannot be logged");
    }

    const { error: insertErr } = await admin.from("logs").insert({
      id: body.clientLogId,
      household_id: claims.hid,
      pet_id: claims.pid,
      type: logType,
      occurred_at: body.occurredAt ?? new Date().toISOString(),
      note: "Logged from notification",
      source: "notification_yes",
      notification_id: claims.nid,
      feed_time_id: claims.feedTimeId ?? null,
      medication_id: claims.medicationId ?? null,
      created_by: actionBy,
    });

    // A duplicate key means our own retry arrived twice. The row already exists, which is
    // exactly the desired state — swallow it.
    if (insertErr && insertErr.code !== UNIQUE_VIOLATION) {
      // The claim was already won above, so the notification now reads 'actioned' while no
      // log exists. Left that way, the phone's retry LOSES the claim and receives a cheerful
      // {ok: true, replayed: true} — the tap is silently dropped and the pet never logged.
      // The claim cannot simply move after the insert: gate 2 only de-duplicates the SAME
      // device's retry, so the claim is what stops the second caregiver writing a second log
      // for one pee. It has to stay first, and be released on failure.
      const { error: releaseErr } = await admin.rpc("release_notification_claim", {
        p_notification_id: claims.nid,
      });
      if (releaseErr) {
        console.error("failed to release claim after log insert failure", releaseErr);
      }
      console.error("log insert failed", insertErr);
      throw new HttpError(500, "SERVER_ERROR");
    }

    // trg_logs_after_insert has now recomputed prediction_state AND superseded any sibling
    // in-flight push for this pet and break type. Realtime broadcasts the new row to every
    // household member's open app. Nothing else to do here.

    return json({
      ok: true,
      logId: body.clientLogId,
      nextPrediction: await currentPrediction(admin, claims),
      replayed: Boolean(insertErr),
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// ---------------------------------------------------------------------------

function json(payload: LogActionResponse): Response {
  return Response.json(payload);
}

function resolveLogType(claims: { kind: string; breakType?: string }): string | null {
  switch (claims.kind) {
    case "break_prediction":
      return claims.breakType ?? null;
    case "meal":
      return "food";
    case "medication":
    case "med_escalation":
      return "medication";
    default:
      return null;   // appointment reminders are not loggable events
  }
}

/**
 * Returned so the client can reconcile its optimistic local prediction against the server's
 * without a second round-trip.
 */
async function currentPrediction(
  admin: ReturnType<typeof adminClient>,
  claims: { pid: string | null; breakType?: string },
): Promise<LogActionResponse["nextPrediction"]> {
  if (!claims.pid || !claims.breakType) return null;

  const { data } = await admin
    .from("prediction_state")
    .select("break_type, predicted_at, notify_at")
    .eq("pet_id", claims.pid)
    .eq("break_type", claims.breakType)
    .maybeSingle();

  if (!data) return null;

  return {
    breakType: data.break_type,
    predictedAt: data.predicted_at,
    notifyAt: data.notify_at,
  };
}
