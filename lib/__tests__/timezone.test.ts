/// <reference types="jest" />
/// <reference types="node" />
/**
 * Household timezone threading (SessionContext.timeZone → snapshot → modules / scheduler).
 *
 * The device (jest process TZ) is America/Chicago (jest.config.js). A household in
 * Asia/Kolkata must get:
 *  - feed-anchor break predictions (Upcoming rows, pushes, nudges) in household time, as
 *    app.recompute_prediction computes them on the server;
 *  - habitat's 10:00 reminder at 10:00 household time.
 * A null / omitted zone falls back to the device, and passing the device's own zone changes
 * nothing anywhere (checked against the full data/mockData.ts household).
 */
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import { getUpcomingForPet, predictBreak } from '../petSchedule';
import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/scheduler';
import { careDesiredNotifications, carePendingNudges } from '../care/household';
import { habitatModule } from '../care/modules/habitat';
import { buildSnapshot, heroFor, petStatus, planQuickLog, planUpcoming, resolvePlan } from '../care/plan';
import { localAt, mkFeed, mkLog, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KOLKATA = 'Asia/Kolkata';
const DEVICE = 'America/Chicago';
const prefs = DEFAULT_NOTIFICATION_PREFS;

describe('feed-anchor break predictions in household time', () => {
  const pet = mkPet({ id: 'mochi', name: 'Mochi', peeHoldHours: 3, poopHoldHours: 3 });
  const feeds: FeedTime[] = [mkFeed('f1', 'mochi', '07:00')];
  // 03:00Z = 08:30 on 15 June in Kolkata, 22:00 on 14 June in Chicago.
  const now = new Date('2026-06-15T03:00:00.000Z');

  test('predictBreak anchors on 07:00 Kolkata, not 07:00 Chicago', () => {
    const household = predictBreak(pet, feeds, [], 'pee', now, KOLKATA)!;
    const device = predictBreak(pet, feeds, [], 'pee', now)!;
    expect(household.anchor.toISOString()).toBe('2026-06-15T01:30:00.000Z');
    expect(device.anchor.toISOString()).toBe('2026-06-14T12:00:00.000Z');
    // One hold after the household anchor, still ahead of now.
    expect(household.predictedAt.toISOString()).toBe('2026-06-15T04:30:00.000Z');
  });

  test('Upcoming rows, hero and pushes all follow the household prediction', () => {
    const p = predictBreak(pet, feeds, [], 'pee', now, KOLKATA)!;

    const rows = getUpcomingForPet(pet, feeds, [], now, KOLKATA);
    const pee = rows.find((r) => r.type === 'pee')!;
    expect(pee.timeEnd.getTime()).toBe(p.predictedAt.getTime() + p.bufferMs);

    const s = buildSnapshot({ pet, feedTimes: feeds, meds: [], logs: [], appts: [], now, timeZone: KOLKATA });
    const plan = resolvePlan(pet);
    const peeRow = planUpcoming(plan, s).find((r) => r.type === 'pee')!;
    expect(peeRow.timeEnd.getTime()).toBe(p.predictedAt.getTime() + p.bufferMs);
    expect(heroFor(plan, s).state).toBe('upcoming');

    const pushes = careDesiredNotifications([pet], feeds, [], [], [], prefs, now, KOLKATA);
    const peePush = pushes.find((d) => d.key === 'break:mochi:pee')!;
    expect(peePush.fireAt.toISOString()).toBe(p.notifyAt.toISOString());

    // In device time the anchor is 07:00 Chicago on the 14th, so that break is long overdue
    // (never rolled forward) and no push is scheduled for it.
    const devicePushes = careDesiredNotifications([pet], feeds, [], [], [], prefs, now);
    expect(devicePushes.find((d) => d.key === 'break:mochi:pee')).toBeUndefined();
  });

  test('nudges use the household prediction', () => {
    // 05:00Z: 10:30 Kolkata — the 04:30Z break is overdue. In Chicago (00:00 on 15 June) the
    // device anchor moves to 07:00 Chicago on the 15th, so nothing is due yet.
    const later = new Date('2026-06-15T05:00:00.000Z');
    const household = carePendingNudges([pet], feeds, [], [], later, {}, KOLKATA);
    expect(household.some((n) => n.key === 'break:mochi:pee')).toBe(true);
    const device = carePendingNudges([pet], feeds, [], [], later);
    expect(device.some((n) => n.key === 'break:mochi:pee')).toBe(false);
  });

  test('a break log anchors the same in any zone (instants are zone-free)', () => {
    const logs = [mkLog('l1', 'mochi', 'pee', new Date('2026-06-15T02:00:00.000Z'))];
    expect(predictBreak(pet, feeds, logs, 'pee', now, KOLKATA)).toEqual(predictBreak(pet, feeds, logs, 'pee', now));
  });
});

describe('habitat reminders at 10:00 household time', () => {
  const pet = mkPet({
    id: 'luna',
    name: 'Luna',
    species: 'cat',
    careModules: ['habitat', 'meals', 'meds', 'visits'],
    habitatIntervalDays: 7,
  });
  // 16:00Z on 10 June: 11:00 Chicago, 21:30 Kolkata — the same local date in both.
  const logs: LogEntry[] = [mkLog('c1', 'luna', 'habitat_clean', new Date('2026-06-10T16:00:00.000Z'))];
  const now = new Date('2026-06-12T12:00:00.000Z');

  test('due at 10:00 Kolkata on the household-local due date', () => {
    const s = buildSnapshot({ pet, feedTimes: [], meds: [], logs, appts: [], now, timeZone: KOLKATA });
    const reminders = habitatModule.reminders!(s, prefs);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].fireAt.toISOString()).toBe('2026-06-17T04:30:00.000Z');
    expect(planUpcoming(resolvePlan(pet), s).find((r) => r.moduleId === 'habitat')!.timeStart.toISOString()).toBe(
      '2026-06-17T04:30:00.000Z',
    );
    const all = careDesiredNotifications([pet], [], [], logs, [], prefs, now, KOLKATA);
    expect(all.find((d) => d.key === 'habitat:luna')!.fireAt.toISOString()).toBe('2026-06-17T04:30:00.000Z');
  });

  test('the due DATE is the household-local date of the last clean', () => {
    // 20:00Z on 10 June is already 11 June in Kolkata (01:30), still 10 June in Chicago.
    const lateLogs = [mkLog('c2', 'luna', 'habitat_clean', new Date('2026-06-10T20:00:00.000Z'))];
    const s = buildSnapshot({ pet, feedTimes: [], meds: [], logs: lateLogs, appts: [], now, timeZone: KOLKATA });
    expect(habitatModule.reminders!(s, prefs)[0].fireAt.toISOString()).toBe('2026-06-18T04:30:00.000Z');
    const d = buildSnapshot({ pet, feedTimes: [], meds: [], logs: lateLogs, appts: [], now });
    expect(habitatModule.reminders!(d, prefs)[0].fireAt.getTime()).toBe(localAt(2026, 6, 17, 10).getTime());
  });

  test('null zone falls back to 10:00 device time', () => {
    for (const timeZone of [null, undefined, '']) {
      const s = buildSnapshot({ pet, feedTimes: [], meds: [], logs, appts: [], now, timeZone });
      expect(s.timeZone).toBeNull();
      expect(habitatModule.reminders!(s, prefs)[0].fireAt.getTime()).toBe(localAt(2026, 6, 17, 10).getTime());
    }
    const all = careDesiredNotifications([pet], [], [], logs, [], prefs, now, null);
    expect(all.find((d) => d.key === 'habitat:luna')!.fireAt.getTime()).toBe(localAt(2026, 6, 17, 10).getTime());
  });
});

// ---------------------------------------------------------------------------
// Device zone == household zone, or no zone: identical to before, on the full mock household.
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

describe('device zone or no zone changes nothing', () => {
  const mock = loadMockData();
  const nows = [
    MOCK_LOAD,
    localAt(2026, 6, 15, 7, 15),
    localAt(2026, 6, 15, 12, 45),
    localAt(2026, 6, 15, 17, 50),
    localAt(2026, 6, 15, 23, 30),
    localAt(2026, 6, 16, 7, 0),
    localAt(2026, 6, 18, 18, 0),
  ];

  function outputs(now: Date, timeZone: string | null | undefined) {
    const perPet = mock.pets.map((pet) => {
      const s = buildSnapshot({
        pet,
        feedTimes: mock.feedTimes.filter((f) => f.petId === pet.id),
        meds: mock.medications.filter((m) => m.petId === pet.id),
        logs: mock.timeline.filter((l) => l.petId === pet.id),
        appts: mock.appointments,
        now,
        timeZone,
      });
      const plan = resolvePlan(pet);
      return {
        hero: heroFor(plan, s),
        upcoming: planUpcoming(plan, s),
        quickLog: planQuickLog(plan, s),
        status: petStatus(plan, s),
      };
    });
    return {
      perPet,
      reminders: careDesiredNotifications(
        mock.pets,
        mock.feedTimes,
        mock.medications,
        mock.timeline,
        mock.appointments,
        prefs,
        now,
        timeZone,
      ),
      nudges: carePendingNudges(mock.pets, mock.feedTimes, mock.medications, mock.timeline, now, {}, timeZone),
    };
  }

  test('the jest device zone is Chicago', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(DEVICE);
  });

  for (const now of nows) {
    test(`identical outputs @ ${now.toISOString()}`, () => {
      const base = outputs(now, undefined);
      expect(outputs(now, null)).toEqual(base);
      expect(outputs(now, DEVICE)).toEqual(base);
    });
  }
});
