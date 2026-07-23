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
  id: string;
  petId: string;
  type: 'pee' | 'poo' | 'food' | 'vet';
  icon: string;
  label: string;
  sub: string;
  time: string;
  /** Epoch ms — the source of truth for scheduling math; `time` is just its display form. */
  timestamp: number;
};

function todayAt(hours: number, minutes: number): number {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export const timeline: TimelineEntry[] = [
  { id: 't1', petId: 'mochi', type: 'pee', icon: '💧', label: 'Pee', sub: 'Outside walk', time: '12:31', timestamp: todayAt(12, 31) },
  { id: 't2', petId: 'mochi', type: 'food', icon: '🍽️', label: 'Lunch', sub: '1 cup dry food', time: '12:00', timestamp: todayAt(12, 0) },
  { id: 't3', petId: 'mochi', type: 'vet', icon: '🏥', label: 'Vet Checkup', sub: 'Annual · Dr. Patel · Done ✓', time: '10:00', timestamp: todayAt(10, 0) },
  { id: 't4', petId: 'mochi', type: 'poo', icon: '💩', label: 'Poo', sub: 'Morning walk', time: '9:15', timestamp: todayAt(9, 15) },
];

export type ApptType = 'vet' | 'groom' | 'vaccine' | 'other';

export type Appointment = {
  id: string;
  type: ApptType;
  title: string;
  petNames: string[];
  date: string;
  time?: string;
  location?: string;
  notes?: string;
  countdown: { label: string; kind: 'soon' | 'upcoming' | 'overdue' };
  reminderEnabled?: boolean;
};

export const appointments: Appointment[] = [
  {
    id: 'a1',
    type: 'vet',
    title: 'Annual Checkup',
    petNames: ['🐶 Mochi'],
    date: 'Fri, Jul 4',
    time: '10:00 AM',
    location: 'City Vet Clinic',
    countdown: { label: 'In 2 days', kind: 'soon' },
    reminderEnabled: true,
  },
  {
    id: 'a2',
    type: 'groom',
    title: 'Full Groom & Bath',
    petNames: ['🐶 Mochi', '🐱 Luna'],
    date: 'Sat, Jul 12',
    time: '2:00 PM',
    location: 'Paws & Claws',
    countdown: { label: 'Jul 12', kind: 'upcoming' },
    reminderEnabled: true,
  },
  {
    id: 'a3',
    type: 'vaccine',
    title: 'Rabies Booster',
    petNames: ['🐰 Peanut'],
    date: 'Was Jun 20',
    countdown: { label: 'Overdue!', kind: 'overdue' },
    reminderEnabled: false,
  },
];

