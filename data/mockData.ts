/**
 * Demo data source — reshaped to the FROZEN CONTRACT types in `lib/db/models.ts`
 * (SYNC-1 model migration). This file no longer defines the domain types; it only
 * exports sample rows in the contract shapes so "Load demo data" works offline.
 *
 * FeedTimes and Medications are their own collections (keyed by petId), matching
 * the contract where a food log can reference a feed_time by id. Logs carry
 * `type` + `occurredAt` (ISO) with no stored icon/label — those are derived at the
 * view edge (Δ3). Appointments carry `startsAt` (ISO) + `allDay`.
 */
import type {
  Appointment,
  FeedTime,
  LogEntry,
  Medication,
  Pet,
} from '../lib/db/models';
import { LOCAL_HOUSEHOLD_ID } from '../lib/localHousehold';

// Re-export the contract types the rest of the app imports as its domain models,
// so existing `from '../data/mockData'` type imports keep resolving during the swap.
export type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../lib/db/models';
export type { ApptType, LogType, Species } from '../lib/db/models';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function todayAtISO(hours: number, minutes: number): string {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function daysFromNowAtISO(days: number, hours: number, minutes: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

const NOW_ISO = new Date().toISOString();

export const pets: Pet[] = [
  {
    // No schedule set, created ~1.2 days ago -> demonstrates the "calibrating" state.
    // Has a medication (separate collection) -> meds show even while calibrating.
    id: 'mochi',
    householdId: LOCAL_HOUSEHOLD_ID,
    name: 'Mochi',
    avatarEmoji: '🐶',
    species: 'dog',
    breed: 'Golden Retriever',
    birthdate: null,
    weightKg: null,
    peeHoldHours: null,
    poopHoldHours: null,
    calibrationStartedAt: daysAgoISO(1.2),
    archivedAt: null,
    createdAt: daysAgoISO(1.2),
    updatedAt: NOW_ISO,
  },
  {
    // Full schedule set -> demonstrates the "ready" state with computed reminders.
    id: 'luna',
    householdId: LOCAL_HOUSEHOLD_ID,
    name: 'Luna',
    avatarEmoji: '🐱',
    species: 'cat',
    breed: 'Tabby Cat',
    birthdate: null,
    weightKg: null,
    peeHoldHours: 4,
    poopHoldHours: 6,
    calibrationStartedAt: daysAgoISO(10),
    archivedAt: null,
    createdAt: daysAgoISO(10),
    updatedAt: NOW_ISO,
  },
  {
    // No schedule set, created 5 days ago -> demonstrates the "needs info" prompt.
    id: 'peanut',
    householdId: LOCAL_HOUSEHOLD_ID,
    name: 'Peanut',
    avatarEmoji: '🐰',
    species: 'rabbit',
    breed: 'Rabbit',
    birthdate: null,
    weightKg: null,
    peeHoldHours: null,
    poopHoldHours: null,
    calibrationStartedAt: daysAgoISO(5),
    archivedAt: null,
    createdAt: daysAgoISO(5),
    updatedAt: NOW_ISO,
  },
];

// Feed times are their own collection now (was Pet.feedTimes: string[]). "HH:MM" 24h.
export const feedTimes: FeedTime[] = [
  { id: 'luna-feed-1', petId: 'luna', localTime: '07:30', label: null, active: true },
  { id: 'luna-feed-2', petId: 'luna', localTime: '18:00', label: null, active: true },
];

// Medications are their own collection now (was Pet.medications). "HH:MM" 24h.
export const medications: Medication[] = [
  { id: 'mochi-med-1', petId: 'mochi', name: 'Joint supplement', dosage: null, localTime: '18:00', active: true },
  { id: 'luna-med-1', petId: 'luna', name: 'Allergy pill', dosage: null, localTime: '08:00', active: true },
];

/** View-model for the horizontal reminder strip — derived, never stored. */
export type Reminder = {
  id: string;
  type: 'pee' | 'poo' | 'food' | 'appt' | 'medication';
  icon: string;
  label: string;
  time: string;
  sub: string;
};

// Mochi has no feed times, so this food log carries no feedTimeId and renders as a
// generic "Meal" at the view edge (Δ3) rather than the old stored "Lunch" label.
export const timeline: LogEntry[] = [
  logEntry('t1', 'mochi', 'pee', todayAtISO(12, 31)),
  logEntry('t2', 'mochi', 'food', todayAtISO(12, 0)),
  logEntry('t3', 'mochi', 'vet', todayAtISO(10, 0)),
  logEntry('t4', 'mochi', 'poo', todayAtISO(9, 15)),
];

function logEntry(id: string, petId: string, type: LogEntry['type'], occurredAt: string): LogEntry {
  return {
    id,
    householdId: LOCAL_HOUSEHOLD_ID,
    petId,
    type,
    occurredAt,
    note: null,
    source: 'manual',
    feedTimeId: null,
    medicationId: null,
    notificationId: null,
    createdBy: null,
    createdAt: occurredAt,
    deletedAt: null,
  };
}

const MINUTES_PER_DAY = 24 * 60;

export const appointments: Appointment[] = [
  {
    // ~2 days out -> demonstrates the "soon" countdown.
    id: 'a1',
    householdId: LOCAL_HOUSEHOLD_ID,
    type: 'vet',
    title: 'Annual Checkup',
    petIds: ['mochi'],
    startsAt: daysFromNowAtISO(2, 10, 0),
    allDay: false,
    location: 'City Vet Clinic',
    notes: null,
    completedAt: null,
    reminderOffsetsMinutes: [MINUTES_PER_DAY],
    deletedAt: null,
  },
  {
    // ~10 days out -> demonstrates the "upcoming" countdown.
    id: 'a2',
    householdId: LOCAL_HOUSEHOLD_ID,
    type: 'groom',
    title: 'Full Groom & Bath',
    petIds: ['mochi', 'luna'],
    startsAt: daysFromNowAtISO(10, 14, 0),
    allDay: false,
    location: 'Paws & Claws',
    notes: null,
    completedAt: null,
    reminderOffsetsMinutes: [7 * MINUTES_PER_DAY, MINUTES_PER_DAY],
    deletedAt: null,
  },
  {
    // ~12 days ago -> demonstrates the "overdue" state. Date-only (allDay).
    id: 'a3',
    householdId: LOCAL_HOUSEHOLD_ID,
    type: 'vaccine',
    title: 'Rabies Booster',
    petIds: ['peanut'],
    startsAt: daysFromNowAtISO(-12, 9, 0),
    allDay: true,
    location: null,
    notes: null,
    completedAt: null,
    reminderOffsetsMinutes: [],
    deletedAt: null,
  },
];
