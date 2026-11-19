/**
 * FROZEN CONTRACT — imported by BOTH the RN app and the Supabase Edge Functions.
 *
 * This file is the handoff between the frontend and backend tracks (SYNC 2). The FE builds
 * its notification categories and response handler against these exact shapes on day 0;
 * the BE's dispatcher emits them. Changing anything here is a coordinated, two-sided change.
 *
 * Nothing in this file may import from `app/`, `context/`, or any Deno-only module — it has
 * to typecheck in React Native and in Deno alike.
 */

/** Payload version. Bump only for a breaking shape change; handlers must ignore unknown versions. */
export const PUSH_PAYLOAD_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Notification categories (OS-level action button groups)
// ---------------------------------------------------------------------------

/**
 * `categoryId` on the push tells the OS which action buttons to render on the lock screen.
 * The app registers these with Notifications.setNotificationCategoryAsync() at startup.
 */
export const CATEGORY = {
  break: 'break-check',
  meal: 'meal-check',
  medication: 'med-check',
  appointment: 'appt-reminder',
  /** Walks / habitat cleaning (Phase 3): "Done / Snooze". Done sends LOG_YES, Snooze SNOOZE_15. */
  care: 'care-check',
} as const;

export type CategoryId = (typeof CATEGORY)[keyof typeof CATEGORY];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Action identifiers. These travel back to the server verbatim in the log-action request,
 * so the strings are part of the wire contract — not just local UI identifiers.
 *
 * LOG_YES   — "yes, it happened": writes a log server-side and re-predicts.
 * LOG_NO    — "not yet": re-asks in 20 min and records a drift signal that can stretch
 *             the pet's hold time (3 consecutive NOs => +0.5h at nightly recalibration).
 * SNOOZE_15 — "ask me later": pushes notify_at out 15 min, no drift signal.
 * OPEN      — default tap (no button): deep-links into the app, writes nothing.
 * DISMISS   — user swiped it away.
 */
export const ACTION = {
  yes: 'LOG_YES',
  no: 'LOG_NO',
  snooze: 'SNOOZE_15',
  open: 'OPEN',
  dismiss: 'DISMISS',
} as const;

export type NotificationAction = (typeof ACTION)[keyof typeof ACTION];

/** Actions the server accepts at POST /functions/v1/log-action. */
export type LoggableAction = Extract<
  NotificationAction,
  'LOG_YES' | 'LOG_NO' | 'SNOOZE_15'
>;

// ---------------------------------------------------------------------------
// Push payloads
// ---------------------------------------------------------------------------

export type BreakType = 'pee' | 'poo';

export type NotificationKind =
  | 'break_prediction'
  | 'meal'
  | 'medication'
  | 'appointment'
  | 'digest'
  | 'med_escalation'
  | 'care_due';

/**
 * Care modules that can raise a server `care_due` push (Phase 3). The wire values are the
 * CareModuleId strings of lib/db/models.ts; declared here because this file may not import
 * app-side modules (it must also resolve in Deno).
 */
export type CareDueModule = 'walks' | 'habitat';

interface BasePushData {
  v: typeof PUSH_PAYLOAD_VERSION;
  kind: NotificationKind;
  /** `notifications.id` — the row that idempotency gate 1 claims. */
  notificationId: string;
  /**
   * Self-contained HS256 JWT, 3h expiry, signed with ACTION_TOKEN_SECRET.
   * Claims: { nid, pid, hid, kind, breakType?, careModule?, exp }.
   *
   * This is what makes the one-tap write work with no live session: on iOS the OS may
   * decline to wake a killed app, and the response is then replayed on next launch —
   * possibly hours later, when any cached Supabase session could be long gone.
   */
  actionToken: string;
  householdId: string;
}

/** The flagship: "Did Mochi go? Yes / Not yet / Snooze" at the predicted break time. */
export interface BreakPushData extends BasePushData {
  kind: 'break_prediction';
  petId: string;
  petName: string;
  breakType: BreakType;
  /** ISO. The predicted moment itself, not the (earlier) time the push fired. */
  predictedAt: string;
}

export interface MealPushData extends BasePushData {
  kind: 'meal';
  petId: string;
  petName: string;
  /** The feed_times row this meal covers. A LOG_YES writes logs.feed_time_id = this (Δ1). */
  feedTimeId: string;
  /** Derived slot name, e.g. "Breakfast" — display only. */
  mealLabel: string;
}

export interface MedicationPushData extends BasePushData {
  kind: 'medication' | 'med_escalation';
  petId: string;
  petName: string;
  medicationId: string;
  medicationName: string;
  dosage: string | null;
}

export interface AppointmentPushData extends BasePushData {
  kind: 'appointment';
  petId: string | null;
  appointmentId: string;
  title: string;
  /** ISO */
  startsAt: string;
  /** Minutes before startsAt that this reminder represents (10080 / 1440 / 120 / 0). */
  offsetMinutes: number;
}

/**
 * Walks / habitat cleaning due (Phase 3, one generic kind — plan "Push kind name"). LOG_YES
 * ("Done") writes a 'walk' / 'habitat_clean' log; SNOOZE_15 re-asks in 15 minutes.
 */
export interface CareDuePushData extends BasePushData {
  kind: 'care_due';
  petId: string;
  petName: string;
  careModule: CareDueModule;
  /** ISO instant the walk / clean falls due (care_state.due_at) — not when the push fired. */
  dueOn: string;
}

export type PawClockPushData =
  | BreakPushData
  | MealPushData
  | MedicationPushData
  | AppointmentPushData
  | CareDuePushData;

/**
 * Every NotificationKind this build understands. A Record so a kind added to the union without
 * being listed here is a compile error.
 */
const KNOWN_KINDS: Record<NotificationKind, true> = {
  break_prediction: true,
  meal: true,
  medication: true,
  appointment: true,
  digest: true,
  med_escalation: true,
  care_due: true,
};

/**
 * Runtime guard — payloads arrive as untyped JSON from the OS.
 *
 * Release N tolerance: only kinds this build knows are accepted. A push of a kind added by a
 * later release (e.g. a future care reminder) is ignored rather than handed to code that would
 * mis-handle it.
 */
export function isPawClockPush(data: unknown): data is PawClockPushData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d.v === PUSH_PAYLOAD_VERSION &&
    typeof d.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(KNOWN_KINDS, d.kind) &&
    typeof d.notificationId === 'string' &&
    typeof d.actionToken === 'string'
  );
}

export function isBreakPush(data: PawClockPushData): data is BreakPushData {
  return data.kind === 'break_prediction';
}

export function isCareDuePush(data: PawClockPushData): data is CareDuePushData {
  return data.kind === 'care_due';
}

// ---------------------------------------------------------------------------
// POST /functions/v1/log-action
// ---------------------------------------------------------------------------

export interface LogActionRequest {
  /** From the push payload. Authenticates the call on its own — no session required. */
  actionToken: string;
  action: LoggableAction;
  /**
   * Client-generated uuid v4, used as the `logs` primary key.
   *
   * This is idempotency gate 2: our own network retries of the same tap re-insert the
   * same PK and no-op. Generate it ONCE per tap and reuse it across retries — generating
   * a fresh uuid per attempt defeats the entire mechanism.
   */
  clientLogId: string;
  /** ISO. Defaults to server now(). Set this when replaying a queued cold-start response. */
  occurredAt?: string;
}

export interface LogActionResponse {
  ok: true;
  /** The written log id, or null for LOG_NO / SNOOZE_15 / a replayed request. */
  logId: string | null;
  /** Where the next push for this break now stands, so the client can reconcile locally. */
  nextPrediction: {
    breakType: BreakType;
    predictedAt: string;
    notifyAt: string;
  } | null;
  /**
   * True when this call changed nothing because the notification was already claimed —
   * the partner answered first, or a manual in-app log superseded the push.
   * NOT an error: the desired end state holds either way. Show a neutral confirmation.
   */
  replayed: boolean;
}

export interface LogActionError {
  ok: false;
  /** INVALID_TOKEN | TOKEN_EXPIRED | RATE_LIMITED | BAD_REQUEST | SERVER_ERROR */
  error: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Android notification channels — one per kind, so users can tune them separately
// ---------------------------------------------------------------------------

export const ANDROID_CHANNEL = {
  break_prediction: { id: 'break_prediction', name: 'Potty breaks',   importance: 'high' },
  meal:             { id: 'meal',             name: 'Meals',          importance: 'default' },
  medication:       { id: 'medication',       name: 'Medications',    importance: 'high' },
  med_escalation:   { id: 'med_escalation',   name: 'Missed meds',    importance: 'high' },
  appointment:      { id: 'appointment',      name: 'Appointments',   importance: 'default' },
  digest:           { id: 'digest',           name: 'Weekly summary', importance: 'low' },
  care_due:         { id: 'care_due',         name: 'Walks & cleaning', importance: 'default' },
} as const;

/**
 * Quiet hours suppress `meal` and `break_prediction` only. Medication and appointment
 * reminders are health-critical and always fire.
 */
export const QUIET_HOURS_SUPPRESSED: readonly NotificationKind[] = [
  'break_prediction',
  'meal',
  'digest',
] as const;
