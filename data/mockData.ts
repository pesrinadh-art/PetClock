export type Medication = {
  id: string;
  name: string;
  /** Time of day it's given, e.g. '8:00 AM'. Assumed daily. */
  time: string;
  dosage?: string;
};

export type Pet = {
  id: string;
  name: string;
  avatar: string;
  breed: string;
  age: string;
  meta: string;
  /** Usual feeding times, e.g. ['7:00 AM', '12:00 PM', '6:30 PM']. Empty = not set. */
  feedTimes: string[];
  /** How long the pet can comfortably hold pee, in hours. null = not set. */
  peeHoldHours: number | null;
  /** How long the pet can comfortably hold poop, in hours. null = not set. */
  poopHoldHours: number | null;
  /** Daily medications, if any — independent of the feed/hold calibration status. */
  medications: Medication[];
  /** When the pet profile was created — drives the calibration countdown. */
  createdAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const pets: Pet[] = [
  {
    // No schedule set, created ~1.2 days ago -> demonstrates the "calibrating" state.
    // Has a medication -> demonstrates medication reminders showing even while calibrating.
    id: 'mochi',
    name: 'Mochi',
    avatar: '🐶',
    breed: 'Golden Retriever',
    age: '2 yrs',
    meta: 'Golden Retriever · 2 yrs',
    feedTimes: [],
    peeHoldHours: null,
    poopHoldHours: null,
    medications: [{ id: 'mochi-med-1', name: 'Joint supplement', time: '6:00 PM' }],
    createdAt: Date.now() - 1.2 * DAY_MS,
  },
  {
    // Full schedule set -> demonstrates the "ready" state with computed reminders.
    id: 'luna',
    name: 'Luna',
    avatar: '🐱',
    breed: 'Tabby Cat',
    age: '1 yr',
    meta: 'Tabby Cat · 1 yr',
    feedTimes: ['7:30 AM', '6:00 PM'],
    peeHoldHours: 4,
    poopHoldHours: 6,
    medications: [{ id: 'luna-med-1', name: 'Allergy pill', time: '8:00 AM' }],
    createdAt: Date.now() - 10 * DAY_MS,
  },
  {
    // No schedule set, created 5 days ago -> demonstrates the "needs info" prompt.
    id: 'peanut',
    name: 'Peanut',
    avatar: '🐰',
    breed: 'Rabbit',
    age: '3 yrs',
    meta: 'Rabbit · 3 yrs',
    feedTimes: [],
    peeHoldHours: null,
    poopHoldHours: null,
    medications: [],
    createdAt: Date.now() - 5 * DAY_MS,
  },
];

export type Reminder = {
  id: string;
  type: 'pee' | 'poo' | 'food' | 'appt' | 'medication';
  icon: string;
  label: string;
  time: string;
  sub: string;
};


export type TimelineEntry = {
  /** Stable unique id, e.g. `pee-<timestamp>-<random>`. */
  id: string;
  petId: string;
  type: 'pee' | 'poo' | 'food' | 'vet';
  icon: string;
  label: string;
  /** Epoch ms — the source of truth; all display strings (clock/relative time) derive from it. */
  timestamp: number;
};

function todayAt(hours: number, minutes: number): number {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export const timeline: TimelineEntry[] = [
  { id: 't1', petId: 'mochi', type: 'pee', icon: '💧', label: 'Pee', timestamp: todayAt(12, 31) },
  { id: 't2', petId: 'mochi', type: 'food', icon: '🍽️', label: 'Lunch', timestamp: todayAt(12, 0) },
  { id: 't3', petId: 'mochi', type: 'vet', icon: '🏥', label: 'Vet Checkup', timestamp: todayAt(10, 0) },
  { id: 't4', petId: 'mochi', type: 'poo', icon: '💩', label: 'Poo', timestamp: todayAt(9, 15) },
];

export type ApptType = 'vet' | 'groom' | 'vaccine' | 'other';

export type Appointment = {
  id: string;
  type: ApptType;
  title: string;
  /** Pet ids (see `pets`) — names/avatars are resolved at render so renames don't break the link. */
  petIds: string[];
  /** Epoch ms — the source of truth for sorting and countdowns; formatted only at the view edge. */
  dateTime: number;
  /** Whether dateTime carries a meaningful time of day (vs. date only). */
  hasTime: boolean;
  location?: string;
  notes?: string;
  /** Reminder lead times in minutes before dateTime; empty = no reminders. */
  reminderOffsets: number[];
};

function daysFromNowAt(days: number, hours: number, minutes: number): number {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

const MINUTES_PER_DAY = 24 * 60;

export const appointments: Appointment[] = [
  {
    // ~2 days out -> demonstrates the "soon" countdown.
    id: 'a1',
    type: 'vet',
    title: 'Annual Checkup',
    petIds: ['mochi'],
    dateTime: daysFromNowAt(2, 10, 0),
    hasTime: true,
    location: 'City Vet Clinic',
    reminderOffsets: [MINUTES_PER_DAY],
  },
  {
    // ~10 days out -> demonstrates the "upcoming" countdown.
    id: 'a2',
    type: 'groom',
    title: 'Full Groom & Bath',
    petIds: ['mochi', 'luna'],
    dateTime: daysFromNowAt(10, 14, 0),
    hasTime: true,
    location: 'Paws & Claws',
    reminderOffsets: [7 * MINUTES_PER_DAY, MINUTES_PER_DAY],
  },
  {
    // ~12 days ago -> demonstrates the "overdue" state.
    id: 'a3',
    type: 'vaccine',
    title: 'Rabies Booster',
    petIds: ['peanut'],
    dateTime: daysFromNowAt(-12, 9, 0),
    hasTime: false,
    reminderOffsets: [],
  },
];

