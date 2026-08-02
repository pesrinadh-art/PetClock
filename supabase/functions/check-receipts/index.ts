/**
 * check-receipts — runs every 15 minutes via pg_cron.
 *
 * Expo's /send call returns *tickets*, meaning "accepted for delivery", not "delivered".
 * The receipt fetched later is what actually reports failure. The one that matters is
 * DeviceNotRegistered: the user uninstalled, or the token rotated. Those tokens are dead
 * and must be revoked, or every future household push wastes a slot on a phone that will
 * never receive it.
 */

import { adminClient, assertServiceRole, errorResponse } from "../_shared/supabase.ts";
import { getExpoReceipts } from "../_shared/expo.ts";

type Ticket = {
  token?: string;
  status?: string;
  id?: string;
  receiptChecked?: boolean;
};

Deno.serve(async (req) => {
  try {
    assertServiceRole(req);
    const admin = adminClient();

    const { data: rows, error } = await admin.rpc("notifications_awaiting_receipts");
    if (error) {
      console.error("notifications_awaiting_receipts failed", error);
      throw error;
    }

    // Map ticket id -> push token, so a failing receipt can be traced back to the device.
    const ticketToToken = new Map<string, string>();
    const ticketIds: string[] = [];

    for (const row of rows ?? []) {
      for (const t of (row.expo_tickets ?? []) as Ticket[]) {
        if (t.status === "ok" && t.id) {
          ticketIds.push(t.id);
          if (t.token) ticketToToken.set(t.id, t.token);
        }
      }
    }

    const receipts = await getExpoReceipts(ticketIds);

    let revoked = 0;
    const alreadyRevoked = new Set<string>();

    for (const [ticketId, receipt] of Object.entries(receipts)) {
      if (receipt.status !== "error") continue;

      const reason = receipt.details?.error;
      const token = ticketToToken.get(ticketId);
      if (!token) continue;

      // DeviceNotRegistered is terminal — the token will never work again.
      // MessageTooBig / MessageRateExceeded are OUR bugs and must not revoke a user's
      // device; they get logged instead.
      if (reason === "DeviceNotRegistered") {
        if (!alreadyRevoked.has(token)) {
          await admin.rpc("revoke_push_token", { p_token: token });
          alreadyRevoked.add(token);
          revoked++;
        }
      } else {
        console.error(`push receipt error (${reason ?? "unknown"}): ${receipt.message}`);
      }
    }

    // Mark them checked so the next run does not re-fetch the same receipts.
    for (const row of rows ?? []) {
      await admin.rpc("mark_receipts_checked", { p_notification_id: row.id });
    }

    return Response.json({
      notifications: rows?.length ?? 0,
      ticketsChecked: ticketIds.length,
      revoked,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
