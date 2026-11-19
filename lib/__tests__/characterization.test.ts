/// <reference types="jest" />
/// <reference types="node" />
/**
 * Phase 0 characterization snapshots (docs/CARE_MODULES_PLAN.md, "Testing").
 *
 * These pin down what the app does TODAY so the care-modules refactor can prove that "every
 * module ticked" behaves exactly the same. They must stay byte-identical through Phase 1; a
 * snapshot update is only acceptable in a phase that explicitly calls for a documented,
 * deliberate behaviour change (e.g. the Phase 0.5 parity fixes).
 *
 * Determinism:
 *  - TZ is pinned to America/Chicago in jest.config.js (petSchedule parses wall-clock times in
 *    the device timezone).
 *  - data/mockData.ts computes its instants from the clock at import time, so it is loaded
 *    under a faked system time (MOCK_LOAD) and every assertion passes an explicit `now`.
 */
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import {
  getPetStatus,
  getTodaysMeals,
  getTodaysMedications,
  getUpcomingForPet,
  getUpcomingMedications,
  predictBreak,
} from '../petSchedule';
import {
  computeDesiredNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '../notifications/scheduler';
import { computePendingNudges } from '../notifications/pending';
import { localAt, mkAppt, mkFeed, mkLog, mkMed, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type Mock = {
  pets: Pet[];
  feedTimes: FeedTime[];
  medications: Medication[];
  timeline: LogEntry[];
  appointments: Appointment[];
};

/** Monday 2026-06-15 06:00 America/Chicago (CDT) — when data/mockData.ts "was loaded". */
const MOCK_LOAD = localAt(2026, 6, 15, 6, 0);

function loadMockData(): Mock {
  jest.useFakeTimers({ now: MOCK_LOAD });
  let mod: Mock | undefined;
  jest.isolateModules(() => {
    mod = require('../../data/mockData') as Mock;
  });
  jest.useRealTimers();
  return mod!;
}

const mock = loadMockData();

/** Pinned "now" values across the mock day, plus the next day and later in the week. */
const MOCK_NOWS: Record<string, Date> = {
  'd0 06:00 (load)': MOCK_LOAD,
  'd0 07:15': localAt(2026, 6, 15, 7, 15),
  'd0 08:30': localAt(2026, 6, 15, 8, 30),
  'd0 12:45': localAt(2026, 6, 15, 12, 45),
  'd0 17:50': localAt(2026, 6, 15, 17, 50),
  'd0 18:30': localAt(2026, 6, 15, 18, 30),
  'd0 23:30': localAt(2026, 6, 15, 23, 30),
  'd1 07:00': localAt(2026, 6, 16, 7, 0),
  'd3 18:00': localAt(2026, 6, 18, 18, 0),
};

function byPet<T extends { petId: string }>(items: T[], petId: string): T[] {
  return items.filter((i) => i.petId === petId);
}

/** Every per-pet pure output the Today/Coming up/PetCard surfaces read. */
function perPetOutputs(
  pets: Pet[],
  feedTimes: FeedTime[],
  medications: Medication[],
  logs: LogEntry[],
  now: Date,
) {
  const out: Record<string, unknown> = {};
  for (const pet of pets) {
    const fts = byPet(feedTimes, pet.id);
    const meds = byPet(medications, pet.id);
    const petLogs = byPet(logs, pet.id);
    const upcoming = getUpcomingForPet(pet, fts, petLogs, now);
    out[pet.id] = {
      status: getPetStatus(pet, fts, now),
      predictBreak: {
        pee: predictBreak(pet, fts, petLogs, 'pee', now),
        poo: predictBreak(pet, fts, petLogs, 'poo', now),
      },
      upcoming,
      upcomingMedications: getUpcomingMedications(meds, now),
      todaysMeals: getTodaysMeals(fts, now, petLogs),
      todaysMedications: getTodaysMedications(meds, now),
      // PetCard hero inputs (PetCard.tsx:86-111): it reads getPetStatus, getTodaysMeals and the
      // first non-food getUpcomingForPet item. Nothing is extracted from the component in
      // Phase 0; the projection below is the exact expression the component evaluates.
      petCardHeroInputs: {
        nextBreak: upcoming.find((u) => u.type !== 'food') ?? null,
        meals: getTodaysMeals(fts, now, petLogs),
      },
    };
  }
  return out;
}

describe('characterization: data/mockData.ts', () => {
  for (const [label, now] of Object.entries(MOCK_NOWS)) {
    test(`per-pet schedule outputs @ ${label}`, () => {
      expect(
        perPetOutputs(mock.pets, mock.feedTimes, mock.medications, mock.timeline, now),
      ).toMatchSnapshot();
    });

    test(`computeDesiredNotifications @ ${label}`, () => {
      expect(
        computeDesiredNotifications(
          mock.pets,
          mock.feedTimes,
          mock.medications,
          mock.timeline,
          mock.appointments,
          DEFAULT_NOTIFICATION_PREFS,
          now,
        ),
      ).toMatchSnapshot();
    });

    test(`computePendingNudges @ ${label}`, () => {
      expect(
        computePendingNudges(mock.pets, mock.feedTimes, mock.medications, mock.timeline, now),
      ).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------
// A richer synthetic household — mockData has no pet that is both scheduled AND has logs,
// so this exercises log anchors, meal slot matching, med logs, one-hold pets, archived pets,
// snoozes, mute and quiet hours.
// ---------------------------------------------------------------------------

const D = (h: number, m = 0) => localAt(2026, 6, 15, h, m);

const sPets: Pet[] = [
  mkPet({ id: 'rex', name: 'Rex', species: 'dog', peeHoldHours: 3, poopHoldHours: 8 }),
  // One hold set: hasSchedule() (pet status, Upcoming list) requires BOTH holds, so Bella reads
  // needsInfo with no Upcoming breaks. Since Phase 0.5, predictBreak is per-type like the
  // server, so Bella DOES get a pee prediction (and pee push/nudge); poo stays null.
  mkPet({ id: 'bella', name: 'Bella', species: 'cat', avatarEmoji: '🐱', peeHoldHours: 4 }),
  // Archived pets are skipped by the scheduler and the nudges.
  mkPet({
    id: 'ghost',
    name: 'Ghost',
    species: 'rabbit',
    peeHoldHours: 2,
    poopHoldHours: 4,
    archivedAt: '2026-06-10T12:00:00.000Z',
  }),
  // Brand-new pet still calibrating (day 2).
  mkPet({ id: 'kiwi', name: 'Kiwi', species: 'bird', calibrationStartedAt: '2026-06-14T12:00:00.000Z' }),
];

const sFeeds: FeedTime[] = [
  mkFeed('rex-f1', 'rex', '07:00'),
  mkFeed('rex-f2', 'rex', '12:00'),
  mkFeed('rex-f3', 'rex', '18:00'),
  mkFeed('rex-f4', 'rex', '21:00', false), // inactive slot is ignored
  mkFeed('bella-f1', 'bella', '08:00'),
  mkFeed('bella-f2', 'bella', '19:00'),
  mkFeed('ghost-f1', 'ghost', '09:00'),
];

const sMeds: Medication[] = [
  mkMed('rex-m1', 'rex', 'Rimadyl', '09:00', '50mg'),
  mkMed('rex-m2', 'rex', 'Eye drops', '20:00'),
  mkMed('rex-m3', 'rex', 'Old pill', '10:00', null, false),
  mkMed('bella-m1', 'bella', 'Allergy pill', '10:30'),
  mkMed('ghost-m1', 'ghost', 'Ghost pill', '09:00'),
];

const sLogs: LogEntry[] = [
  mkLog('l1', 'rex', 'poo', D(7, 20)),
  mkLog('l2', 'rex', 'food', D(7, 5), { feedTimeId: 'rex-f1' }),
  mkLog('l3', 'rex', 'pee', D(8, 10)),
  mkLog('l4', 'rex', 'pee', D(9, 0), { deletedAt: D(9, 1).toISOString() }), // undone
  mkLog('l5', 'rex', 'medication', D(9, 5), { medicationId: 'rex-m1' }),
  mkLog('l6', 'rex', 'pee', localAt(2026, 6, 14, 22, 0)), // yesterday, superseded by l3
  mkLog('l7', 'bella', 'pee', D(6, 45)),
  // Dinner logged early, out of order, by feed-time id (Δ1).
  mkLog('l8', 'bella', 'food', D(9, 30), { feedTimeId: 'bella-f2' }),
  mkLog('l9', 'kiwi', 'food', D(8, 0)),
];

const sAppts: Appointment[] = [
  mkAppt({
    id: 'ap1',
    title: 'Dental cleaning',
    petIds: ['rex'],
    startsAt: localAt(2026, 6, 17, 15, 0).toISOString(),
    reminderOffsetsMinutes: [1440, 60],
  }),
  mkAppt({
    id: 'ap2',
    title: 'Done already',
    petIds: ['rex'],
    startsAt: localAt(2026, 6, 16, 10, 0).toISOString(),
    completedAt: D(8, 0).toISOString(),
    reminderOffsetsMinutes: [60],
  }),
  mkAppt({
    id: 'ap3',
    title: 'Deleted',
    petIds: ['bella'],
    startsAt: localAt(2026, 6, 16, 10, 0).toISOString(),
    deletedAt: D(8, 0).toISOString(),
    reminderOffsetsMinutes: [60],
  }),
  mkAppt({
    id: 'ap4',
    type: 'groom',
    title: 'Household groom (no pet)',
    startsAt: D(13, 0).toISOString(),
    reminderOffsetsMinutes: [120, 0],
  }),
];

const SYNTH_NOWS: Record<string, Date> = {
  'd0 09:30': D(9, 30),
  'd0 10:50': D(10, 50),
  'd0 11:15': D(11, 15),
  'd0 12:30': D(12, 30),
  'd0 17:55': D(17, 55),
  'd0 21:00': D(21, 0),
  'd0 23:59': D(23, 59),
};

const PREF_VARIANTS: Record<string, (now: Date) => NotificationPrefs> = {
  default: () => DEFAULT_NOTIFICATION_PREFS,
  'quiet 21:00-07:00': () => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    quietHoursStart: '21:00',
    quietHoursEnd: '07:00',
  }),
  'quiet 10:00-12:30 (same-day)': () => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    quietHoursStart: '10:00',
    quietHoursEnd: '12:30',
  }),
  'mute rex': () => ({ ...DEFAULT_NOTIFICATION_PREFS, mutedPetIds: ['rex'] }),
  'snooze rex pee + bella med 20m': (now) => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    snoozedUntil: {
      'break:rex:pee': now.getTime() + 20 * 60 * 1000,
      'med:bella:bella-m1': now.getTime() + 20 * 60 * 1000,
      'break:rex:poo': now.getTime() - 60 * 1000, // expired snooze is ignored
    },
  }),
};

describe('characterization: synthetic household', () => {
  for (const [label, now] of Object.entries(SYNTH_NOWS)) {
    test(`per-pet schedule outputs @ ${label}`, () => {
      expect(perPetOutputs(sPets, sFeeds, sMeds, sLogs, now)).toMatchSnapshot();
    });

    for (const [prefLabel, prefs] of Object.entries(PREF_VARIANTS)) {
      test(`computeDesiredNotifications [${prefLabel}] @ ${label}`, () => {
        expect(
          computeDesiredNotifications(sPets, sFeeds, sMeds, sLogs, sAppts, prefs(now), now),
        ).toMatchSnapshot();
      });
    }

    test(`computePendingNudges (no snooze) @ ${label}`, () => {
      expect(computePendingNudges(sPets, sFeeds, sMeds, sLogs, now)).toMatchSnapshot();
    });

    test(`computePendingNudges (snoozed) @ ${label}`, () => {
      expect(
        computePendingNudges(
          sPets,
          sFeeds,
          sMeds,
          sLogs,
          now,
          PREF_VARIANTS['snooze rex pee + bella med 20m'](now).snoozedUntil,
        ),
      ).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------
// Quick-log menu items
// ---------------------------------------------------------------------------
// components/QuickLogMenu.tsx keeps ITEMS module-private and the file imports React Native,
// expo-haptics, expo-blur and the repo singletons, so it is NOT imported here (Phase 0 changes
// no component). This is a hard-coded description of today's menu, transcribed from
// QuickLogMenu.tsx:27-32 and the write rules in useQuickLog (:66-82). When Phase 1 moves the
// menu onto `quickLog` facets, the care-module output with every module ticked must produce
// exactly this list.
const QUICK_LOG_TODAY = [
  { key: 'pee', icon: 'drop', label: 'Pee', verb: 'pee', writes: [{ type: 'pee' }] },
  { key: 'poo', icon: 'poo', label: 'Poo', verb: 'poo', writes: [{ type: 'poo' }] },
  {
    key: 'both',
    icon: 'drop',
    label: 'Both',
    verb: 'go',
    // One instant for both logs; one Undo removes both.
    writes: [{ type: 'pee' }, { type: 'poo' }],
  },
  { key: 'fed', icon: 'bowl', label: 'Fed', verb: 'eat', writes: [{ type: 'food', feedTimeId: null }] },
];

test('quick-log menu items (hard-coded expectation of today)', () => {
  expect(QUICK_LOG_TODAY).toMatchSnapshot();
});
