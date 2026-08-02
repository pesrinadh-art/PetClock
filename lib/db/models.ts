/**
 * FROZEN CONTRACT — client-side domain models.
 *
 * These replace the types in `data/mockData.ts` once the repo swap lands (SYNC 1). They are
 * hand-written rather than generated so the client vocabulary stays camelCase and stable
 * even if a column is renamed; `lib/db/types.gen.ts` holds the raw generated row types and
 * the mappers below are the single place the two meet.
 *
 * Read alongside `docs/BACKEND_DESIGN.md` §2 — the Δ notes here are those deltas.
 */

// ---------------------------------------------------------------------------
// Enums — mirror the Postgres types in supabase/migrations/0002_enums.sql
// ---------------------------------------------------------------------------

export type Species =
  | 'dog' | 'cat' | 'rabbit' | 'hamster' | 'bird' | 'turtle' | 'snake' | 'fish' | 'other';

/** Δ: 'medication' is new vs the old TimelineEntry union — meds finally get real logs. */
export type LogType = 'pee' | 'poo' | 'food' | 'medication' | 'vet' | 'other';

export type LogSource =
  | 'manual' | 'notification_yes' | 'backfill' | 'import' | 'system' | 'walker';

export type ApptType = 'vet' | 'groom' | 'vaccine' | 'other';

export type BreakType = 'pee' | 'poo';

export type MemberRole = 'owner' | 'member' | 'walker';

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

export type Household = {
  id: string;
  name: string;
  /** IANA tz. Belongs to the household, not the user — a shared dog lives in one place. */
  timezone: string;
  /** "HH:MM" or null. Suppresses break/meal pushes; meds and appointments still fire. */
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  createdAt: string;
};

export type HouseholdMember = {
  householdId: string;
  userId: string;
  role: MemberRole;
  /** Non-null only for time-boxed walker access; past this instant they are not a member. */
  memberExpiresAt: string | null;
  joinedAt: string;
  profile: Profile | null;
};

export type Profile = {
  userId: string;
  displayName: string | null;
  avatarEmoji: string;
};

export type HouseholdInvite = {
  id: string;
  code: string;
  role: MemberRole;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  revokedAt: string | null;
};

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

export type Pet = {
  id: string;
  householdId: string;
  name: string;
  avatarEmoji: string;
  species: Species;
  breed: string | null;
  /**
   * Δ6: replaces the static `age: '2 yrs'` string, which never aged.
   * Nullable — the FE birthdate picker ships after SYNC 1 and nothing blocks on it.
   * Render with formatAge(birthdate); `meta` is gone entirely, derive it from breed + age.
   */
  birthdate: string | null;
  weightKg: number | null;
  /** null = not yet calibrated. Clamped 0.5–24 server-side. */
  peeHoldHours: number | null;
  poopHoldHours: number | null;
  /** Drives the 3-day calibration countdown (was Pet.createdAt). */
  calibrationStartedAt: string;
  /** Soft delete. Archived pets keep their log history. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Was Pet.feedTimes: string[] of '7:30 AM'. Now a row, so a food log can reference it. */
export type FeedTime = {
  id: string;
  petId: string;
  /** "HH:MM", 24-hour, wall clock in the household timezone. */
  localTime: string;
  label: string | null;
  active: boolean;
};

export type Medication = {
  id: string;
  petId: string;
  name: string;
  dosage: string | null;
  /** "HH:MM", 24-hour. */
  localTime: string;
  active: boolean;
};

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

/**
 * Δ3: `icon` and `label` are NOT here. They were presentation stored as data.
 * Derive them at the view edge from `type` (and `feedTimeId` for meal slot names).
 * This is the one place SYNC 1 reaches past the repo seam into FE internals —
 * `Timeline.tsx` and `getTodaysMeals()` both need updating.
 */
export type LogEntry = {
  /**
   * Δ4: client-generated uuid v4 (expo-crypto randomUUID), not `pee-${Date.now()}-${rand}`.
   * This IS the offline idempotency key — the same id may be sent many times safely.
   */
  id: string;
  householdId: string;
  petId: string;
  type: LogType;
  /** ISO. Replaces `timestamp: number`. */
  occurredAt: string;
  note: string | null;
  source: LogSource;
  /**
   * Δ1: which meal slot this food log covers.
   *
   * getTodaysMeals() currently matches food logs to slots by label name, so logging
   * "Dinner" flips the Dinner row even out of order. That behaviour is deliberate and
   * must survive: match on this id instead of the name. Logs without one still fall back
   * to covering the earliest uncovered slot chronologically.
   */
  feedTimeId: string | null;
  /** Which dose this medication log records. */
  medicationId: string | null;
  /** Set when written from a push action — lets the UI show "logged from notification". */
  notificationId: string | null;
  /** Who logged it. Renders "logged by Alex" in a shared household. */
  createdBy: string | null;
  createdAt: string;
  /** Soft delete: the undo window, and the sync tombstone. */
  deletedAt: string | null;
};

export type NewLogInput = {
  id: string;
  petId: string;
  householdId: string;
  type: LogType;
  occurredAt?: string;
  note?: string | null;
  feedTimeId?: string | null;
  medicationId?: string | null;
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export type Appointment = {
  id: string;
  householdId: string;
  type: ApptType;
  title: string;
  /** ISO. No stored countdown — compute it at render, every render. */
  startsAt: string;
  /**
   * Δ2: the DB column is `all_day`; the existing client model calls this `hasTime`.
   * They are inverses. The repo mapper does the flip — see toAppointment() below.
   */
  allDay: boolean;
  location: string | null;
  notes: string | null;
  completedAt: string | null;
  /** From appointment_pets. Already matches the current client shape. */
  petIds: string[];
  /** From appointment_reminders. Minutes before startsAt: [10080, 1440, 120]. */
  reminderOffsetsMinutes: number[];
  deletedAt: string | null;
};

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------

/**
 * The server's authoritative view of when a break is due. The client still computes its
 * own from lib/petSchedule.ts for instant optimistic UI; both implement the same algorithm
 * (see app.recompute_prediction), so they agree.
 *
 * Note `predictedAt` may be in the PAST — a missed break stays put and reads as overdue
 * rather than silently rolling to the next cycle (Δ7, matching nextRepeating()).
 */
export type PredictionState = {
  petId: string;
  breakType: BreakType;
  anchorAt: string | null;
  holdHours: number | null;
  predictedAt: string | null;
  /** Uncertainty window, clamped 10–45 min. The push fires at predictedAt − this. */
  bufferMinutes: number | null;
  notifyAt: string | null;
  snoozedUntil: string | null;
  /** Consecutive "not yet" answers. At 3, nightly recalibration stretches the hold. */
  consecutiveNoCount: number;
  updatedAt: string;
};

/** Result of rpc('infer_schedule') — a suggestion, never applied without user consent. */
export type InferredSchedule = {
  peeHoldHours: number;
  poopHoldHours: number;
  /** "HH:MM" strings, chronological. */
  feedTimes: string[];
};

// ---------------------------------------------------------------------------
// Row → model mappers
// ---------------------------------------------------------------------------
// The DB speaks snake_case; the app speaks camelCase. Keeping the translation in one
// place means a column rename is a one-line change here, not a sweep through screens.

type Row = Record<string, any>;

export function toPet(r: Row): Pet {
  return {
    id: r.id,
    householdId: r.household_id,
    name: r.name,
    avatarEmoji: r.avatar_emoji,
    species: r.species,
    breed: r.breed,
    birthdate: r.birthdate,
    weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
    peeHoldHours: r.pee_hold_hours === null ? null : Number(r.pee_hold_hours),
    poopHoldHours: r.poop_hold_hours === null ? null : Number(r.poop_hold_hours),
    calibrationStartedAt: r.calibration_started_at,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Postgres `time` comes back as "HH:MM:SS"; the app only ever wants "HH:MM". */
const trimSeconds = (t: string): string => t.slice(0, 5);

export function toFeedTime(r: Row): FeedTime {
  return {
    id: r.id,
    petId: r.pet_id,
    localTime: trimSeconds(r.local_time),
    label: r.label,
    active: r.active,
  };
}

export function toMedication(r: Row): Medication {
  return {
    id: r.id,
    petId: r.pet_id,
    name: r.name,
    dosage: r.dosage,
    localTime: trimSeconds(r.local_time),
    active: r.active,
  };
}

export function toLogEntry(r: Row): LogEntry {
  return {
    id: r.id,
    householdId: r.household_id,
    petId: r.pet_id,
    type: r.type,
    occurredAt: r.occurred_at,
    note: r.note,
    source: r.source,
    feedTimeId: r.feed_time_id ?? null,
    medicationId: r.medication_id ?? null,
    notificationId: r.notification_id ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
  };
}

export function toAppointment(
  r: Row,
  petIds: string[] = [],
  reminderOffsetsMinutes: number[] = [],
): Appointment {
  return {
    id: r.id,
    householdId: r.household_id,
    type: r.type,
    title: r.title,
    startsAt: r.starts_at,
    allDay: r.all_day,
    location: r.location,
    notes: r.notes,
    completedAt: r.completed_at,
    petIds,
    reminderOffsetsMinutes,
    deletedAt: r.deleted_at,
  };
}

export function toPredictionState(r: Row): PredictionState {
  return {
    petId: r.pet_id,
    breakType: r.break_type,
    anchorAt: r.anchor_at,
    holdHours: r.hold_hours === null ? null : Number(r.hold_hours),
    predictedAt: r.predicted_at,
    bufferMinutes: r.buffer_minutes,
    notifyAt: r.notify_at,
    snoozedUntil: r.snoozed_until,
    consecutiveNoCount: r.consecutive_no_count,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Δ2 helpers — the hasTime ⇄ allDay bridge
// ---------------------------------------------------------------------------

/** Existing client code models this as `hasTime`. Keep using it; convert at the seam. */
export const hasTimeToAllDay = (hasTime: boolean): boolean => !hasTime;
export const allDayToHasTime = (allDay: boolean): boolean => !allDay;
