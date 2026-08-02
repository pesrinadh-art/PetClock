/**
 * dispatch-notifications — invoked every minute by pg_cron via pg_net.
 *
 * Four due-queries, one send path. The whole function is built around a single guarantee:
 * a push is sent at most once, no matter how many times this runs.
 *
 * That guarantee lives in `notifications.dedupe_key`, which is UNIQUE. Every send begins
 * with an INSERT. If the insert collides (23505), a previous tick already handled this
 * item and we skip. Overlapping cron ticks, retries after a timeout, and a pg_net
 * redelivery all collapse to the same no-op.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, assertServiceRole, errorResponse } from "../_shared/supabase.ts";
import { signActionToken } from "../_shared/tokens.ts";
import { type ExpoMessage, sendExpoPush } from "../_shared/expo.ts";
import {
  ANDROID_CHANNEL,
  CATEGORY,
  PUSH_PAYLOAD_VERSION,
} from "../../../shared/notificationContracts.ts";

/** Postgres unique-violation. The signal that another tick got here first. */
const UNIQUE_VIOLATION = "23505";

type DueItem = {
  kind: "break_prediction" | "meal" | "medication" | "appointment";
  dedupeKey: string;
  householdId: string;
  petId: string | null;
  title: string;
  body: string;
  categoryId?: string;
  channelId: string;
  /** Extra push-payload fields, merged into `data`. */
  data: Record<string, unknown>;
  /** Claims beyond the common ones, embedded in the action token. */
  tokenClaims: Record<string, unknown>;
  /** Runs after a successful send — rolls state forward so this cannot re-fire. */
  onSent?: (admin: SupabaseClient, notificationId: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Due-item collection
// ---------------------------------------------------------------------------
// The queries themselves live in SQL (migration 0011) so they can use the partial
// indexes and keep timezone arithmetic next to the data.

async function collectDueItems(admin: SupabaseClient): Promise<DueItem[]> {
  const items: DueItem[] = [];

  const [breaks, meals, meds, appts] = await Promise.all([
    admin.rpc("due_break_predictions"),
    admin.rpc("due_meals"),
    admin.rpc("due_medications"),
    admin.rpc("due_appointment_reminders"),
  ]);

  for (const [label, res] of Object.entries({ breaks, meals, meds, appts })) {
    if (res.error) console.error(`due query ${label} failed`, res.error);
  }

  for (const r of breaks.data ?? []) {
    const icon = r.break_type === "pee" ? "💧" : "💩";
    const word = r.break_type === "pee" ? "pee" : "poo";
    items.push({
      kind: "break_prediction",
      dedupeKey: r.dedupe_key,
      householdId: r.household_id,
      petId: r.pet_id,
      title: `${icon} ${r.pet_name}'s ${word} break`,
      body: `Predicted around ${formatLocal(r.predicted_at)} — did ${r.pet_name} go?`,
      categoryId: CATEGORY.break,
      channelId: ANDROID_CHANNEL.break_prediction.id,
      data: {
        petId: r.pet_id,
        petName: r.pet_name,
        breakType: r.break_type,
        predictedAt: r.predicted_at,
      },
      tokenClaims: { breakType: r.break_type },
      onSent: async (a, nid) => {
        // Roll notify_at forward one cycle so an unanswered push does not re-fire every
        // minute. predicted_at is untouched — it stays put so the app still reads
        // "overdue" (Δ7).
        await a.rpc("mark_break_dispatched", {
          p_pet_id: r.pet_id,
          p_break_type: r.break_type,
          p_notification_id: nid,
        });
      },
    });
  }

  for (const r of meals.data ?? []) {
    items.push({
      kind: "meal",
      dedupeKey: r.dedupe_key,
      householdId: r.household_id,
      petId: r.pet_id,
      title: `🍽️ ${r.pet_name}'s ${r.meal_label.toLowerCase()}`,
      body: `Time to feed ${r.pet_name}.`,
      categoryId: CATEGORY.meal,
      channelId: ANDROID_CHANNEL.meal.id,
      data: { petId: r.pet_id, petName: r.pet_name, feedTimeId: r.feed_time_id, mealLabel: r.meal_label },
      tokenClaims: { feedTimeId: r.feed_time_id },
    });
  }

  for (const r of meds.data ?? []) {
    items.push({
      kind: "medication",
      dedupeKey: r.dedupe_key,
      householdId: r.household_id,
      petId: r.pet_id,
      title: `💊 ${r.pet_name}'s ${r.medication_name}`,
      body: r.dosage ? `${r.dosage} — due now.` : "Due now.",
      categoryId: CATEGORY.medication,
      channelId: ANDROID_CHANNEL.medication.id,
      data: {
        petId: r.pet_id,
        petName: r.pet_name,
        medicationId: r.medication_id,
        medicationName: r.medication_name,
        dosage: r.dosage,
      },
      tokenClaims: { medicationId: r.medication_id },
    });
  }

  for (const r of appts.data ?? []) {
    items.push({
      kind: "appointment",
      dedupeKey: r.dedupe_key,
      householdId: r.household_id,
      petId: r.pet_id,
      title: `📅 ${r.title}`,
      body: `${describeLead(r.offset_minutes)} — ${formatLocal(r.starts_at)}.`,
      categoryId: CATEGORY.appointment,
      channelId: ANDROID_CHANNEL.appointment.id,
      data: {
        appointmentId: r.appointment_id,
        title: r.title,
        startsAt: r.starts_at,
        offsetMinutes: r.offset_minutes,
      },
      tokenClaims: {},
      onSent: async (a) => {
        await a.rpc("mark_reminder_sent", { p_reminder_id: r.reminder_id });
      },
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------
// Two queries rather than a join: notification_tokens and household_members both point at
// auth.users, with no direct relationship for PostgREST to traverse. Cached per run,
// since several pets usually share one household.

function makeTokenLookup(admin: SupabaseClient) {
  const cache = new Map<string, string[]>();

  return async function tokensFor(householdId: string): Promise<string[]> {
    const hit = cache.get(householdId);
    if (hit) return hit;

    const { data: members, error: mErr } = await admin
      .from("household_members")
      .select("user_id, member_expires_at")
      .eq("household_id", householdId);

    if (mErr || !members?.length) {
      cache.set(householdId, []);
      return [];
    }

    // Exclude walkers whose window has closed — they should stop receiving pushes the
    // moment their access lapses.
    const now = Date.now();
    const userIds = members
      .filter((m) => !m.member_expires_at || new Date(m.member_expires_at).getTime() > now)
      .map((m) => m.user_id);

    if (userIds.length === 0) {
      cache.set(householdId, []);
      return [];
    }

    const { data: tokens } = await admin
      .from("notification_tokens")
      .select("expo_push_token")
      .in("user_id", userIds)
      .is("revoked_at", null);

    const list = (tokens ?? []).map((t) => t.expo_push_token);
    cache.set(householdId, list);
    return list;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    assertServiceRole(req);

    const admin = adminClient();
    const tokensFor = makeTokenLookup(admin);
    const due = await collectDueItems(admin);

    let sent = 0;
    let skipped = 0;
    let noRecipients = 0;

    for (const item of due) {
      // ---- IDEMPOTENCY GATE: unique dedupe_key -----------------------------
      const nowIso = new Date().toISOString();
      const { data: notif, error } = await admin
        .from("notifications")
        .insert({
          household_id: item.householdId,
          pet_id: item.petId,
          kind: item.kind,
          dedupe_key: item.dedupeKey,
          title: item.title,
          body: item.body,
          data: { v: PUSH_PAYLOAD_VERSION, kind: item.kind, ...item.data },
          scheduled_for: nowIso,
          sent_at: nowIso,
          status: "sent",
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          skipped++;              // a previous tick already sent this exact item
          continue;
        }
        console.error("notification insert failed", item.dedupeKey, error);
        continue;
      }

      const notificationId = notif.id as string;

      const tokens = await tokensFor(item.householdId);
      if (tokens.length === 0) {
        // Nobody has registered a device yet. The row still exists (so the audit trail and
        // dedupe hold), and bookkeeping still runs so we do not retry forever.
        noRecipients++;
        await item.onSent?.(admin, notificationId);
        continue;
      }

      const actionToken = await signActionToken({
        nid: notificationId,
        pid: item.petId,
        hid: item.householdId,
        kind: item.kind,
        ...item.tokenClaims,
      });

      const messages: ExpoMessage[] = tokens.map((to) => ({
        to,
        title: item.title,
        body: item.body,
        sound: "default",
        categoryId: item.categoryId,   // renders Yes / Not yet / Snooze on the lock screen
        channelId: item.channelId,
        priority: "high",
        data: {
          v: PUSH_PAYLOAD_VERSION,
          kind: item.kind,
          notificationId,
          actionToken,
          householdId: item.householdId,
          ...item.data,
        },
      }));

      const tickets = await sendExpoPush(messages);

      await admin
        .from("notifications")
        .update({ expo_tickets: tickets })
        .eq("id", notificationId);

      // Bookkeeping runs regardless of ticket errors: the push was attempted, and leaving
      // notify_at in the past would re-fire this every minute forever.
      await item.onSent?.(admin, notificationId);
      sent++;
    }

    return Response.json({ due: due.length, sent, skipped, noRecipients });
  } catch (err) {
    return errorResponse(err);
  }
});

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

function formatLocal(iso: string): string {
  // Deliberately coarse. Precise local formatting belongs on the device, which knows the
  // user's locale and 12/24-hour preference; this is only the fallback body text.
  const d = new Date(iso);
  const h = d.getUTCHours() % 12 || 12;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m} ${d.getUTCHours() < 12 ? "AM" : "PM"} UTC`;
}

function describeLead(minutes: number): string {
  if (minutes >= 10080) return `In ${Math.round(minutes / 10080)} week(s)`;
  if (minutes >= 1440) return `In ${Math.round(minutes / 1440)} day(s)`;
  if (minutes >= 60) return `In ${Math.round(minutes / 60)} hour(s)`;
  return minutes === 0 ? "Now" : `In ${minutes} min`;
}
