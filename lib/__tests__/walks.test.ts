/// <reference types="jest" />
/// <reference types="node" />
/**
 * Care modules Phase 2 — the walks module (lib/care/modules/walks.ts).
 *
 *  - Due math: the next walk is the last walk + walkIntervalHours (default 4h when unset).
 *  - Never roll forward: a missed walk stays put and reads as overdue.
 *  - Reminders: one local care_due reminder per pet, buffer before the walk; never in the past,
 *    suppressed in quiet hours, overridden by a live snooze, dropped for muted pets.
 *  - The plan: walks is opt-in; with the four legacy modules every output is exactly today's,
 *    even when walk / habitat_clean logs exist.
 */
import type { FeedTime, LogEntry, Medication, Pet } from '../db/models';
import {
  computeDesiredNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '../notifications/scheduler';
import { computePendingNudges } from '../notifications/pending';
import { getUpcomingForPet, getUpcomingMedications } from '../petSchedule';
import { careDesiredNotifications, carePendingNudges } from '../care/household';
import { predictWalk, walksModule } from '../care/modules/walks';
import {
  buildSnapshot,
  heroFor,
  petStatus,
  planQuickLog,
  planUpcoming,
  resolvePlan,
} from '../care/plan';
import { CARE_RHYTHMS } from '../care/flags';
import { DEFAULT_WALK_INTERVAL_HOURS, rhythmsForPet } from '../care/rhythms';
import { defaultCareModules } from '../care/species';
import { localAt, mkFeed, mkLog, mkMed, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const D = (h: number, m = 0) => localAt(2026, 6, 15, h, m);
const HOUR = 3_600_000;
const MIN = 60_000;

const dog = (extra: Partial<Pet> = {}): Pet =>
  mkPet({
    id: 'rex',
    name: 'Rex',
    species: 'dog',
    careModules: ['potty', 'walks', 'meals', 'meds', 'visits'],
    walkIntervalHours: 3,
    ...extra,
  });

const walk = (id: string, at: Date, extra: Partial<LogEntry> = {}) => mkLog(id, 'rex', 'walk', at, extra);

function snap(pet: Pet, logs: LogEntry[], now: Date, feedTimes: FeedTime[] = [], meds: Medication[] = []) {
  return buildSnapshot({ pet, feedTimes, meds, logs, appts: [], now });
}

describe('walk due math', () => {
  test('nothing is predicted before the first walk', () => {
    const s = snap(dog(), [], D(9));
    expect(predictWalk(s.pet, s.logs, s.now)).toBeNull();
    expect(walksModule.upcoming!(s)).toEqual([]);
    expect(walksModule.hero!(s)).toBeNull();
    expect(walksModule.reminders!(s, DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
  });

  test('the next walk is the last walk + the interval', () => {
    const p = predictWalk(dog(), [walk('w1', D(6)), walk('w2', D(8))], D(9))!;
    expect(p.anchor).toEqual(D(8));
    expect(p.predictedAt).toEqual(D(11));
    expect(p.overdueBy).toBe(0);
    expect(p.kind).toBe('upcoming');
    // 10% of 3h = 18 min (within the 5–20 min clamp).
    expect(p.bufferMs).toBe(18 * MIN);
    expect(p.notifyAt).toEqual(D(10, 42));
  });

  test('an unset interval reads as the default', () => {
    expect(rhythmsForPet(dog({ walkIntervalHours: null })).walkIntervalHours).toBe(DEFAULT_WALK_INTERVAL_HOURS);
    expect(rhythmsForPet(dog({ walkIntervalHours: undefined })).walkIntervalHours).toBe(DEFAULT_WALK_INTERVAL_HOURS);
    const p = predictWalk(dog({ walkIntervalHours: null }), [walk('w1', D(8))], D(9))!;
    expect(p.predictedAt).toEqual(D(8 + DEFAULT_WALK_INTERVAL_HOURS));
  });

  test('out-of-range intervals clamp to the DB CHECK range', () => {
    expect(rhythmsForPet(dog({ walkIntervalHours: 0.1 })).walkIntervalHours).toBe(0.5);
    expect(rhythmsForPet(dog({ walkIntervalHours: 99 })).walkIntervalHours).toBe(24);
    expect(rhythmsForPet(dog({ walkIntervalHours: 0 })).walkIntervalHours).toBe(DEFAULT_WALK_INTERVAL_HOURS);
  });

  test('deleted walks are ignored', () => {
    const logs = [walk('w1', D(6)), walk('w2', D(8), { deletedAt: D(8, 1).toISOString() })];
    expect(predictWalk(dog(), logs, D(7))!.predictedAt).toEqual(D(9));
  });

  test('a future-dated walk still predicts one interval after it (like the potty log anchor)', () => {
    expect(predictWalk(dog(), [walk('w1', D(10))], D(9))!.predictedAt).toEqual(D(13));
  });

  test('the walk is "due" inside its window', () => {
    expect(predictWalk(dog(), [walk('w1', D(8))], D(10, 50))!.kind).toBe('due');
  });

  test('a missed walk stays put and reads as overdue — it never rolls forward', () => {
    for (const now of [D(11, 1), D(14), D(23, 59), localAt(2026, 6, 16, 9)]) {
      const p = predictWalk(dog(), [walk('w1', D(8))], now)!;
      expect(p.predictedAt).toEqual(D(11));
      expect(p.kind).toBe('overdue');
      expect(p.overdueBy).toBe(now.getTime() - D(11).getTime());
    }
  });
});

describe('walk outputs', () => {
  test('upcoming row: "Walk", at the predicted time', () => {
    const [row] = walksModule.upcoming!(snap(dog(), [walk('w1', D(8))], D(9)));
    expect(row).toMatchObject({ id: 'walk', type: 'walk', label: 'Walk', kind: 'upcoming', overdueBy: 0 });
    expect(row.timeStart).toEqual(D(11));
    expect(row.timeEnd).toEqual(D(11));
  });

  test('overdue upcoming row keeps the missed time', () => {
    const [row] = walksModule.upcoming!(snap(dog(), [walk('w1', D(8))], D(14)));
    expect(row.kind).toBe('overdue');
    expect(row.timeStart).toEqual(D(11));
    expect(row.overdueBy).toBe(3 * HOUR);
  });

  test('hero: countdown before, due inside the window, gently late after', () => {
    const logs = [walk('w1', D(8))];
    const upcoming = walksModule.hero!(snap(dog(), logs, D(9)))!;
    expect(upcoming).toMatchObject({ moduleId: 'walks', state: 'upcoming', kicker: 'Walk in', headline: '2h' });
    expect(upcoming.headlineMono).toBe(true);
    expect(upcoming.progress).toBeCloseTo(1 / 3);

    expect(walksModule.hero!(snap(dog(), logs, D(10, 50)))).toMatchObject({ state: 'due', headline: 'Due now' });

    const late = walksModule.hero!(snap(dog(), logs, D(13)))!;
    expect(late).toMatchObject({ state: 'late', late: true, progress: 1, kicker: 'Walk', headline: 'Running late' });
  });

  test('quick log: one "Walk" action writing one walk log', () => {
    expect(walksModule.quickLog!(snap(dog(), [], D(9)))).toEqual([
      { key: 'walk', icon: 'paw', label: 'Walk', verb: 'walk', writes: [{ type: 'walk' }] },
    ]);
  });

  test('reads only walk logs', () => {
    const own = [walk('w1', D(8))];
    const all = [...own, mkLog('p1', 'rex', 'pee', D(8, 30)), mkLog('h1', 'rex', 'habitat_clean', D(8, 40))];
    for (const now of [D(9), D(10, 50), D(14)]) {
      const a = snap(dog(), own, now);
      const b = snap(dog(), all, now);
      expect(walksModule.upcoming!(b)).toEqual(walksModule.upcoming!(a));
      expect(walksModule.hero!(b)).toEqual(walksModule.hero!(a));
      expect(walksModule.reminders!(b, DEFAULT_NOTIFICATION_PREFS)).toEqual(
        walksModule.reminders!(a, DEFAULT_NOTIFICATION_PREFS),
      );
    }
  });
});

describe('walk reminders (local, behind CARE_RHYTHMS)', () => {
  const logs = [walk('w1', D(8))];

  test('the flag is on', () => {
    expect(CARE_RHYTHMS).toBe(true);
  });

  test('one care_due reminder, the buffer before the walk', () => {
    const [r, ...rest] = walksModule.reminders!(snap(dog(), logs, D(9)), DEFAULT_NOTIFICATION_PREFS);
    expect(rest).toEqual([]);
    expect(r.key).toBe('walk:rex');
    expect(r.fireAt).toEqual(D(10, 42));
    expect(r.title).toBe('Walk time for Rex 🦮');
    expect(r.categoryId).toBe('appt-reminder');
    expect(r.data).toMatchObject({
      v: 1,
      kind: 'care_due',
      petId: 'rex',
      careModule: 'walks',
      dueOn: D(11).toISOString(),
      reconcileKey: 'walk:rex',
      fireAtMs: D(10, 42).getTime(),
    });
  });

  test('never schedules the past: an overdue walk has no reminder', () => {
    expect(walksModule.reminders!(snap(dog(), logs, D(10, 45)), DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
    expect(walksModule.reminders!(snap(dog(), logs, D(14)), DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
  });

  test('quiet hours suppress it; a live snooze moves it', () => {
    const quiet: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, quietHoursStart: '10:00', quietHoursEnd: '11:00' };
    expect(walksModule.reminders!(snap(dog(), logs, D(9)), quiet)).toEqual([]);
    const snoozed: NotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      snoozedUntil: { 'walk:rex': D(12).getTime() },
    };
    expect(walksModule.reminders!(snap(dog(), logs, D(9)), snoozed)[0].fireAt).toEqual(D(12));
  });

  test('household composition includes it, and mute drops it', () => {
    const pets = [dog()];
    const all = careDesiredNotifications(pets, [], [], logs, [], DEFAULT_NOTIFICATION_PREFS, D(9));
    expect(all.map((d) => d.key)).toContain('walk:rex');
    const muted = careDesiredNotifications(
      pets,
      [],
      [],
      logs,
      [],
      { ...DEFAULT_NOTIFICATION_PREFS, mutedPetIds: ['rex'] },
      D(9),
    );
    expect(muted.map((d) => d.key)).not.toContain('walk:rex');
  });
});

describe('walks in the care plan', () => {
  const feeds = [mkFeed('f1', 'rex', '07:00'), mkFeed('f2', 'rex', '18:00')];

  test('new dogs start with walks; existing pets do not gain it', () => {
    expect(defaultCareModules('dog')).toContain('walks');
    expect(resolvePlan(mkPet({ id: 'old', name: 'Old' })).map((m) => m.id)).not.toContain('walks');
  });

  test('potty leads the hero; walks speaks when potty is off', () => {
    const pet = dog({ peeHoldHours: 3, poopHoldHours: 8 });
    const logs = [walk('w1', D(8))];
    expect(heroFor(resolvePlan(pet), snap(pet, logs, D(9), feeds)).moduleId).toBe('potty');
    const noPotty = dog({ careModules: ['walks', 'meals'] });
    expect(heroFor(resolvePlan(noPotty), snap(noPotty, logs, D(9), feeds)).moduleId).toBe('walks');
    // No walk logged yet: walks has nothing to say, so the plan falls through.
    expect(heroFor(resolvePlan(noPotty), snap(noPotty, [], D(9), feeds)).state).toBe('caughtUp');
  });

  test('quick log: Pee, Poo, Both, Walk, Fed — five, within the arc', () => {
    const pet = dog({ peeHoldHours: 3, poopHoldHours: 8 });
    expect(planQuickLog(resolvePlan(pet), snap(pet, [], D(9), feeds)).map((a) => a.key)).toEqual([
      'pee',
      'poo',
      'both',
      'walk',
      'fed',
    ]);
  });

  test('the walk row shows while potty is still calibrating', () => {
    const pet = dog({ calibrationStartedAt: D(6).toISOString() }); // no holds: potty learning
    const s = snap(pet, [walk('w1', D(8))], D(9), feeds);
    const plan = resolvePlan(pet);
    expect(petStatus(plan, s).kind).not.toBe('ready');
    expect(planUpcoming(plan, s).map((r) => r.id)).toEqual(['walk']);
    expect(planUpcoming(plan, s)[0].lineIcon).toBe('paw');
  });
});

describe('with the four legacy modules nothing changes', () => {
  // Today's behaviour, with walk / habitat_clean logs present that no legacy module may read.
  const pet = mkPet({ id: 'rex', name: 'Rex', species: 'dog', peeHoldHours: 3, poopHoldHours: 8 });
  const feeds = [mkFeed('f1', 'rex', '07:00'), mkFeed('f2', 'rex', '12:00'), mkFeed('f3', 'rex', '18:00')];
  const meds = [mkMed('m1', 'rex', 'Rimadyl', '09:00', '50mg')];
  const legacyLogs = [mkLog('p1', 'rex', 'pee', D(8, 10)), mkLog('f1l', 'rex', 'food', D(7, 5), { feedTimeId: 'f1' })];
  const logs = [...legacyLogs, walk('w1', D(8)), mkLog('h1', 'rex', 'habitat_clean', D(8, 20))];

  test.each([D(7, 15), D(9), D(12, 45), D(18, 30), D(23, 30)])('outputs equal the legacy functions @ %p', (now) => {
    const plan = resolvePlan(pet);
    expect(plan.map((m) => m.id)).toEqual(['potty', 'meds', 'meals', 'visits']); // hero priority
    const s = snap(pet, logs, now, feeds, meds);

    const legacyUpcoming = [
      ...getUpcomingForPet(pet, feeds, legacyLogs, now),
      ...getUpcomingMedications(meds, now),
    ].sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime());
    expect(planUpcoming(plan, s).map(({ moduleId: _m, lineIcon: _l, ...row }) => row)).toEqual(legacyUpcoming);

    expect(careDesiredNotifications([pet], feeds, meds, logs, [], DEFAULT_NOTIFICATION_PREFS, now)).toEqual(
      computeDesiredNotifications([pet], feeds, meds, legacyLogs, [], DEFAULT_NOTIFICATION_PREFS, now),
    );
    expect(carePendingNudges([pet], feeds, meds, logs, now)).toEqual(
      computePendingNudges([pet], feeds, meds, legacyLogs, now),
    );
    expect(planQuickLog(plan, s).map((a) => a.key)).toEqual(['pee', 'poo', 'both', 'fed']);
    expect(heroFor(plan, s)).toEqual(heroFor(plan, snap(pet, legacyLogs, now, feeds, meds)));
  });
});
