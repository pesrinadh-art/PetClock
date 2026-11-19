/// <reference types="jest" />
/// <reference types="node" />
/**
 * Phase 1 care-module layer (docs/CARE_MODULES_PLAN.md).
 *
 * 1. Equivalence: with careModules = potty, meals, meds, visits (every existing pet), the
 *    layer's upcoming / reminders / nudges / quick-log / hero / status outputs equal today's
 *    functions' outputs over the Phase 0 fixtures (data/mockData.ts + the synthetic household
 *    from characterization.test.ts), at every pinned `now`.
 * 2. Switching modules off: potty off removes every break output and keeps meals; cats default
 *    without potty.
 * 3. Guardrails: each module reads only the log types it declares; stored rows without
 *    care_modules map to today's behaviour.
 */
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import { LEGACY_CARE_MODULES, narrowCareModules, toPet } from '../db/models';
import {
  formatClock,
  formatTimeRange,
  getPetStatus,
  getUpcomingForPet,
  getUpcomingMedications,
} from '../petSchedule';
import {
  computeDesiredNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '../notifications/scheduler';
import { computePendingNudges } from '../notifications/pending';
import { gentleLate, petMeta } from '../petVoice';
import { bufferMsFor, nextRepeating } from '../care/engines/rhythm';
import { careDesiredNotifications, carePendingNudges } from '../care/household';
import {
  buildSnapshot,
  heroFor,
  petStatus,
  planQuickLog,
  planUpcoming,
  planView,
  resolvePlan,
} from '../care/plan';
import { REGISTRY } from '../care/registry';
import { defaultCareModules, offeredCareModules, SPECIES_PROFILES } from '../care/species';
import type { CareUpcomingItem, HeroModel } from '../care/types';
import { localAt, mkAppt, mkFeed, mkLog, mkMed, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ---------------------------------------------------------------------------
// Fixtures — the same inputs as characterization.test.ts
// ---------------------------------------------------------------------------

type Mock = {
  pets: Pet[];
  feedTimes: FeedTime[];
  medications: Medication[];
  timeline: LogEntry[];
  appointments: Appointment[];
};

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

const D = (h: number, m = 0) => localAt(2026, 6, 15, h, m);

const sPets: Pet[] = [
  mkPet({ id: 'rex', name: 'Rex', species: 'dog', peeHoldHours: 3, poopHoldHours: 8 }),
  mkPet({ id: 'bella', name: 'Bella', species: 'cat', avatarEmoji: '🐱', peeHoldHours: 4 }),
  mkPet({
    id: 'ghost',
    name: 'Ghost',
    species: 'rabbit',
    peeHoldHours: 2,
    poopHoldHours: 4,
    archivedAt: '2026-06-10T12:00:00.000Z',
  }),
  mkPet({ id: 'kiwi', name: 'Kiwi', species: 'bird', calibrationStartedAt: '2026-06-14T12:00:00.000Z' }),
];

const sFeeds: FeedTime[] = [
  mkFeed('rex-f1', 'rex', '07:00'),
  mkFeed('rex-f2', 'rex', '12:00'),
  mkFeed('rex-f3', 'rex', '18:00'),
  mkFeed('rex-f4', 'rex', '21:00', false),
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
  mkLog('l4', 'rex', 'pee', D(9, 0), { deletedAt: D(9, 1).toISOString() }),
  mkLog('l5', 'rex', 'medication', D(9, 5), { medicationId: 'rex-m1' }),
  mkLog('l6', 'rex', 'pee', localAt(2026, 6, 14, 22, 0)),
  mkLog('l7', 'bella', 'pee', D(6, 45)),
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
  'quiet 21:00-07:00': () => ({ ...DEFAULT_NOTIFICATION_PREFS, quietHoursStart: '21:00', quietHoursEnd: '07:00' }),
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
      'break:rex:poo': now.getTime() - 60 * 1000,
    },
  }),
};

type Household = {
  label: string;
  pets: Pet[];
  feedTimes: FeedTime[];
  meds: Medication[];
  logs: LogEntry[];
  appts: Appointment[];
  nows: Record<string, Date>;
};

const HOUSEHOLDS: Household[] = [
  {
    label: 'mockData',
    pets: mock.pets,
    feedTimes: mock.feedTimes,
    meds: mock.medications,
    logs: mock.timeline,
    appts: mock.appointments,
    nows: MOCK_NOWS,
  },
  { label: 'synthetic', pets: sPets, feedTimes: sFeeds, meds: sMeds, logs: sLogs, appts: sAppts, nows: SYNTH_NOWS },
];

// ---------------------------------------------------------------------------
// Today's code, transcribed where it lives inside a component
// ---------------------------------------------------------------------------

const byPet = <T extends { petId: string }>(items: T[], petId: string): T[] =>
  items.filter((i) => i.petId === petId);

function snapshotFor(h: Household, pet: Pet, now: Date) {
  return buildSnapshot({
    pet,
    feedTimes: byPet(h.feedTimes, pet.id),
    meds: byPet(h.meds, pet.id),
    logs: byPet(h.logs, pet.id),
    appts: h.appts,
    now,
  });
}

/** UpcomingSection.tsx, before its 5-item cap: meds only until ready, then breaks + meal + meds. */
function legacyUpcoming(pet: Pet, fts: FeedTime[], meds: Medication[], logs: LogEntry[], now: Date) {
  const medicationItems = getUpcomingMedications(meds, now);
  if (getPetStatus(pet, fts, now).kind !== 'ready') return medicationItems;
  const holdItems = getUpcomingForPet(pet, fts, logs, now);
  return [...holdItems, ...medicationItems].sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime());
}

/** PetCard.tsx's hero text/ring model, verbatim. */
function legacyHero(pet: Pet, fts: FeedTime[], logs: LogEntry[], now: Date) {
  const countdown = (ms: number): string => {
    if (ms <= 0) return 'Now';
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins}m`;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return mm ? `${hh}h ${mm}m` : `${hh}h`;
  };
  const status = getPetStatus(pet, fts, now);
  const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
  let kicker = petMeta(pet, now);
  let headline = pet.name;
  let detail = '';
  let progress: number | null = null;
  let late = false;
  let headlineMono = false;
  if (status.kind === 'calibrating') {
    kicker = `Day ${status.day} of 3`;
    headline = `Getting to know ${pet.name}`;
    detail = "Keep logging and we'll learn the routine.";
  } else if (status.kind === 'needsInfo') {
    headline = `Let's set up ${pet.name}`;
    detail = 'Add meal and potty times to get reminders.';
  } else {
    const next = getUpcomingForPet(pet, fts, logs, now).find((u) => u.type !== 'food');
    if (next) {
      const what = next.type === 'poo' ? 'Poo break' : 'Pee break';
      headlineMono = true;
      if (next.kind === 'overdue') {
        late = true;
        progress = 1;
        kicker = what;
        headline = gentleLate(Math.floor(next.overdueBy / 60_000)).replace(/^./, (c) => c.toUpperCase());
        detail = `due ${formatClock(new Date(now.getTime() - next.overdueBy))}`;
        headlineMono = false;
      } else if (next.kind === 'due') {
        progress = 1;
        kicker = what;
        headline = 'Due now';
        detail = formatTimeRange(next.timeStart, next.timeEnd);
        headlineMono = false;
      } else {
        kicker = `${what} in`;
        headline = countdown(next.timeStart.getTime() - now.getTime());
        detail = formatTimeRange(next.timeStart, next.timeEnd);
        if (Number.isFinite(tightestHold) && tightestHold > 0) {
          const remaining = next.timeStart.getTime() - now.getTime();
          progress = 1 - remaining / (tightestHold * 3_600_000);
        }
      }
    } else {
      detail = Number.isFinite(tightestHold) ? `${petMeta(pet, now)} · ${tightestHold}h hold time` : '';
      kicker = 'No break predicted yet';
    }
  }
  return { kicker, headline, detail, progress, late, headlineMono };
}

/** QuickLogMenu.tsx ITEMS + useQuickLog write rules (same list as the Phase 0 snapshot). */
const QUICK_LOG_TODAY = [
  { key: 'pee', icon: 'drop', label: 'Pee', verb: 'pee', writes: [{ type: 'pee' }] },
  { key: 'poo', icon: 'poo', label: 'Poo', verb: 'poo', writes: [{ type: 'poo' }] },
  { key: 'both', icon: 'drop', label: 'Both', verb: 'go', writes: [{ type: 'pee' }, { type: 'poo' }] },
  { key: 'fed', icon: 'bowl', label: 'Fed', verb: 'eat', writes: [{ type: 'food', feedTimeId: null }] },
];

const stripCareFields = (items: CareUpcomingItem[]) =>
  items.map(({ moduleId: _m, lineIcon: _i, ...rest }) => rest);

const heroText = ({ kicker, headline, detail, progress, late, headlineMono }: HeroModel) => ({
  kicker,
  headline,
  detail,
  progress,
  late,
  headlineMono,
});

const withModules = (pets: Pet[], ids: string[], modules: Pet['careModules']): Pet[] =>
  pets.map((p) => (ids.includes(p.id) ? { ...p, careModules: modules } : p));

// ---------------------------------------------------------------------------
// 1. Equivalence with every (legacy) module ticked
// ---------------------------------------------------------------------------

describe('every module ticked behaves exactly like today', () => {
  test('fixtures really have the legacy module list', () => {
    for (const h of HOUSEHOLDS) {
      for (const pet of h.pets) expect(pet.careModules).toEqual([...LEGACY_CARE_MODULES]);
    }
  });

  for (const h of HOUSEHOLDS) {
    for (const [label, now] of Object.entries(h.nows)) {
      test(`${h.label} per-pet outputs @ ${label}`, () => {
        for (const pet of h.pets) {
          const fts = byPet(h.feedTimes, pet.id);
          const meds = byPet(h.meds, pet.id);
          const logs = byPet(h.logs, pet.id);
          const plan = resolvePlan(pet);
          const s = snapshotFor(h, pet, now);

          expect(planView(plan).moduleIds).toEqual(['potty', 'meds', 'meals', 'visits']);
          expect(petStatus(plan, s)).toEqual(getPetStatus(pet, fts, now));
          expect(stripCareFields(planUpcoming(plan, s))).toEqual(legacyUpcoming(pet, fts, meds, logs, now));
          const hero = heroFor(plan, s);
          expect(hero.moduleId).toBe('potty');
          expect(heroText(hero)).toEqual(legacyHero(pet, fts, logs, now));
          expect(planQuickLog(plan, s)).toEqual(QUICK_LOG_TODAY);
        }
      });

      const prefVariants = h.label === 'synthetic' ? PREF_VARIANTS : { default: PREF_VARIANTS.default };
      for (const [prefLabel, prefs] of Object.entries(prefVariants)) {
        test(`${h.label} reminders [${prefLabel}] @ ${label}`, () => {
          const p = prefs(now);
          expect(careDesiredNotifications(h.pets, h.feedTimes, h.meds, h.logs, h.appts, p, now)).toEqual(
            computeDesiredNotifications(h.pets, h.feedTimes, h.meds, h.logs, h.appts, p, now),
          );
        });
      }

      test(`${h.label} nudges @ ${label}`, () => {
        expect(carePendingNudges(h.pets, h.feedTimes, h.meds, h.logs, now)).toEqual(
          computePendingNudges(h.pets, h.feedTimes, h.meds, h.logs, now),
        );
        const snoozes = PREF_VARIANTS['snooze rex pee + bella med 20m'](now).snoozedUntil;
        expect(carePendingNudges(h.pets, h.feedTimes, h.meds, h.logs, now, snoozes)).toEqual(
          computePendingNudges(h.pets, h.feedTimes, h.meds, h.logs, now, snoozes),
        );
      });
    }
  }

  test('the fixtures exercise every hero state and non-empty outputs', () => {
    const states = new Set<string>();
    let upcomingRows = 0;
    for (const h of HOUSEHOLDS) {
      for (const now of Object.values(h.nows)) {
        for (const pet of h.pets) {
          const plan = resolvePlan(pet);
          const s = snapshotFor(h, pet, now);
          states.add(heroFor(plan, s).state);
          upcomingRows += planUpcoming(plan, s).length;
        }
      }
    }
    for (const st of ['upcoming', 'due', 'late', 'learning', 'needsInfo']) expect(states).toContain(st);
    expect(upcomingRows).toBeGreaterThan(20);
  });

  test('the upcoming rows carry the same line icons UpcomingSection draws', () => {
    const h = HOUSEHOLDS[1];
    const rex = sPets[0];
    const rows = planUpcoming(resolvePlan(rex), snapshotFor(h, rex, D(9, 30)));
    const ITEM_ICON = { pee: 'drop', poo: 'poo', food: 'bowl', medication: 'pill' } as const;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.lineIcon).toBe(ITEM_ICON[r.type]);
  });
});

// ---------------------------------------------------------------------------
// 2. Switching modules off
// ---------------------------------------------------------------------------

describe('potty switched off', () => {
  const pets = withModules(sPets, ['rex', 'bella'], ['meals', 'meds', 'visits']);
  const rex = pets[0];
  const h: Household = { ...HOUSEHOLDS[1], pets };

  test('no break upcoming, hero, quick log; meals and meds remain; status ready', () => {
    for (const now of Object.values(SYNTH_NOWS)) {
      const plan = resolvePlan(rex);
      const s = snapshotFor(h, rex, now);
      const upcoming = planUpcoming(plan, s);
      expect(upcoming.some((u) => u.type === 'pee' || u.type === 'poo')).toBe(false);
      expect(upcoming.some((u) => u.type === 'food')).toBe(true);
      expect(upcoming.some((u) => u.type === 'medication')).toBe(true);
      expect(petStatus(plan, s)).toEqual({ kind: 'ready' });
      const hero = heroFor(plan, s);
      expect(hero.moduleId).not.toBe('potty');
      expect(hero.state).toBe('caughtUp');
      expect(planQuickLog(plan, s).map((a) => a.key)).toEqual(['fed']);
    }
  });

  test('the meal row is the same one today shows when potty is on', () => {
    const now = D(9, 30);
    const on = planUpcoming(resolvePlan(sPets[0]), snapshotFor(HOUSEHOLDS[1], sPets[0], now));
    const off = planUpcoming(resolvePlan(rex), snapshotFor(h, rex, now));
    expect(off.find((u) => u.type === 'food')).toEqual(on.find((u) => u.type === 'food'));
  });

  test('no break reminders or nudges; meals/meds/appointments still fire', () => {
    for (const now of Object.values(SYNTH_NOWS)) {
      const reminders = careDesiredNotifications(pets, sFeeds, sMeds, sLogs, sAppts, DEFAULT_NOTIFICATION_PREFS, now);
      const legacy = computeDesiredNotifications(sPets, sFeeds, sMeds, sLogs, sAppts, DEFAULT_NOTIFICATION_PREFS, now);
      expect(reminders.some((d) => d.data.kind === 'break_prediction')).toBe(false);
      // Everything that is not a break is untouched.
      expect(reminders).toEqual(legacy.filter((d) => d.data.kind !== 'break_prediction'));

      const nudges = carePendingNudges(pets, sFeeds, sMeds, sLogs, now);
      expect(nudges.some((n) => n.kind === 'break')).toBe(false);
      expect(nudges).toEqual(computePendingNudges(sPets, sFeeds, sMeds, sLogs, now).filter((n) => n.kind !== 'break'));
    }
    // Meals specifically survive: at 17:55 Rex's 18:00 dinner push is still ahead.
    const at = careDesiredNotifications(pets, sFeeds, sMeds, sLogs, sAppts, DEFAULT_NOTIFICATION_PREFS, D(17, 55));
    expect(at.some((d) => d.key === 'meal:rex:rex-f3')).toBe(true);
  });

  test('a pet with potty off is not stuck calibrating / needsInfo', () => {
    const kiwi = { ...sPets[3], careModules: ['meals' as const] };
    const s = snapshotFor(HOUSEHOLDS[1], kiwi, D(9, 30));
    expect(getPetStatus(kiwi, [], D(9, 30)).kind).toBe('calibrating');
    expect(petStatus(resolvePlan(kiwi), s)).toEqual({ kind: 'ready' });
  });
});

describe('other modules switched off', () => {
  test('visits off drops that pet’s appointment reminders but not household ones', () => {
    const pets = withModules(sPets, ['rex'], ['potty', 'meals', 'meds']);
    const now = D(9, 30);
    const out = careDesiredNotifications(pets, sFeeds, sMeds, sLogs, sAppts, DEFAULT_NOTIFICATION_PREFS, now);
    expect(out.some((d) => d.key.startsWith('appt:ap1:'))).toBe(false);
    expect(out.some((d) => d.key.startsWith('appt:ap4:'))).toBe(true);
    expect(out.some((d) => d.data.kind === 'break_prediction')).toBe(true);
  });

  test('meds off drops med rows, pushes and nudges only', () => {
    const pets = withModules(sPets, ['rex'], ['potty', 'meals', 'visits']);
    const now = D(10, 50);
    const out = careDesiredNotifications(pets, sFeeds, sMeds, sLogs, sAppts, DEFAULT_NOTIFICATION_PREFS, now);
    expect(out.some((d) => d.key.startsWith('med:rex:'))).toBe(false);
    expect(out.some((d) => d.key.startsWith('med:bella:'))).toBe(true);
    const rex = pets[0];
    const rows = planUpcoming(resolvePlan(rex), snapshotFor({ ...HOUSEHOLDS[1], pets }, rex, now));
    expect(rows.some((u) => u.type === 'medication')).toBe(false);
    expect(carePendingNudges(pets, sFeeds, sMeds, sLogs, now).some((n) => n.key.startsWith('med:rex:'))).toBe(false);
  });

  test('no modules at all: caught-up hero, nothing else', () => {
    const rex = { ...sPets[0], careModules: [] };
    const plan = resolvePlan(rex);
    const s = snapshotFor(HOUSEHOLDS[1], rex, D(9, 30));
    expect(plan).toHaveLength(0);
    expect(heroFor(plan, s).state).toBe('caughtUp');
    expect(planUpcoming(plan, s)).toEqual([]);
    expect(planQuickLog(plan, s)).toEqual([]);
    expect(petStatus(plan, s)).toEqual({ kind: 'ready' });
  });
});

// ---------------------------------------------------------------------------
// 3. Species defaults, mapping fallback, guardrails
// ---------------------------------------------------------------------------

describe('species profiles', () => {
  test('cat defaults exclude potty, but potty is offered', () => {
    expect(SPECIES_PROFILES.cat.defaults).not.toContain('potty');
    expect(defaultCareModules('cat')).not.toContain('potty');
    expect(offeredCareModules('cat')).toContain('potty');
  });

  test('dog defaults are potty, walks, meals, meds, visits (walks ships in Phase 2)', () => {
    expect([...SPECIES_PROFILES.dog.defaults].sort()).toEqual(['meals', 'meds', 'potty', 'visits', 'walks']);
    // Only implemented modules are stored on a new pet, so nothing turns on by itself later.
    expect(defaultCareModules('dog')).toEqual(['potty', 'meals', 'meds', 'visits']);
  });

  test('every species has a row whose defaults are offered; unknown species read as other', () => {
    for (const p of Object.values(SPECIES_PROFILES)) {
      for (const d of p.defaults) expect(p.offered).toContain(d);
    }
    expect(defaultCareModules('dragon')).toEqual(defaultCareModules('other'));
  });
});

describe('careModules mapping fallback', () => {
  const row = {
    id: 'p1',
    household_id: 'h1',
    name: 'Rex',
    avatar_emoji: '🐶',
    species: 'cat',
    breed: null,
    birthdate: null,
    weight_kg: null,
    pee_hold_hours: null,
    poop_hold_hours: null,
    calibration_started_at: '2026-01-01T00:00:00.000Z',
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  test('a row without care_modules (DB without 0019) gets today’s modules', () => {
    expect(toPet(row).careModules).toEqual(['potty', 'meals', 'meds', 'visits']);
    expect(toPet({ ...row, care_modules: null }).careModules).toEqual(['potty', 'meals', 'meds', 'visits']);
  });

  test('a stored list is kept as is, unknown values and duplicates dropped', () => {
    expect(toPet({ ...row, care_modules: ['meals', 'habitat'] }).careModules).toEqual(['meals', 'habitat']);
    expect(toPet({ ...row, care_modules: [] }).careModules).toEqual([]);
    expect(narrowCareModules(['meals', 'zoomies', 'meals', 7])).toEqual(['meals']);
  });
});

describe('guardrails', () => {
  test('each module reads only the log types it declares', () => {
    for (const h of HOUSEHOLDS) {
      for (const [, now] of Object.entries(h.nows)) {
        for (const pet of h.pets) {
          const full = snapshotFor(h, pet, now);
          for (const m of REGISTRY) {
            const own = { ...full, logs: full.logs.filter((l) => m.logTypes.includes(l.type)) };
            expect(m.status?.(own)).toEqual(m.status?.(full));
            expect(m.upcoming?.(own)).toEqual(m.upcoming?.(full));
            expect(m.hero?.(own)).toEqual(m.hero?.(full));
            expect(m.quickLog?.(own)).toEqual(m.quickLog?.(full));
            expect(m.reminders?.(own, DEFAULT_NOTIFICATION_PREFS)).toEqual(
              m.reminders?.(full, DEFAULT_NOTIFICATION_PREFS),
            );
            expect(m.nudges?.(own, {})).toEqual(m.nudges?.(full, {}));
            for (const a of m.quickLog?.(full) ?? []) {
              for (const w of a.writes) expect(m.logTypes).toContain(w.type);
            }
          }
        }
      }
    }
  });

  test('module priorities give the strict hero order', () => {
    const order = [...REGISTRY].sort((a, b) => a.priority - b.priority).map((m) => m.id);
    expect(order).toEqual(['potty', 'meds', 'meals', 'visits']);
  });
});

describe('rhythm engine (extracted verbatim)', () => {
  test('buffer is 15% of the hold, clamped to 10–45 min', () => {
    expect(bufferMsFor(0.5)).toBe(10 * 60_000);
    expect(bufferMsFor(3)).toBe(27 * 60_000);
    expect(bufferMsFor(8)).toBe(45 * 60_000);
  });

  test('a missed prediction stays put and reads as overdue (never rolls forward)', () => {
    const anchor = D(6, 0);
    const r = nextRepeating(anchor, 2, D(12, 0));
    expect(r.predicted).toEqual(D(8, 0));
    expect(r.overdueBy).toBe(4 * 3_600_000);
    expect(nextRepeating(D(13, 0), 2, D(12, 0))).toEqual({ predicted: D(13, 0), overdueBy: 0 });
  });
});
