/// <reference types="jest" />
/// <reference types="node" />
/**
 * Care modules Phase 2 — the habitat-cleaning module (lib/care/modules/habitat.ts).
 *
 *  - Due math: due on the household-local DATE of the last clean + habitatIntervalDays, at
 *    10:00 household time (device time when the household zone is unknown).
 *  - Never roll forward: a missed clean stays overdue on its original date.
 *  - Copy: "Clean litter tray in 2 days" / "Litter tray cleaning is due", in the species' noun.
 *
 * The test process TZ is America/Chicago (jest.config.js), so "device time" is Chicago.
 */
import type { LogEntry, Pet } from '../db/models';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../notifications/scheduler';
import { addDays, daysBetween, habitatDue, habitatModule, instantOn, localDateOf } from '../care/modules/habitat';
import { buildSnapshot, heroFor, planQuickLog, planUpcoming, resolvePlan } from '../care/plan';
import { rhythmsForPet } from '../care/rhythms';
import { defaultCareModules, SPECIES_PROFILES } from '../care/species';
import type { CareSnapshot } from '../care/types';
import { localAt, mkLog, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const at = (d: number, h: number, m = 0) => localAt(2026, 6, d, h, m);

const cat = (extra: Partial<Pet> = {}): Pet =>
  mkPet({
    id: 'luna',
    name: 'Luna',
    species: 'cat',
    avatarEmoji: '🐱',
    careModules: ['habitat', 'meals', 'meds', 'visits'],
    habitatIntervalDays: 7,
    ...extra,
  });

const clean = (id: string, when: Date, extra: Partial<LogEntry> = {}) =>
  mkLog(id, 'luna', 'habitat_clean', when, extra);

function snap(pet: Pet, logs: LogEntry[], now: Date, timeZone?: string): CareSnapshot {
  const s = buildSnapshot({ pet, feedTimes: [], meds: [], logs, appts: [], now });
  // The household zone rides on the snapshot when the caller knows it (see habitat.ts).
  return timeZone ? ({ ...s, timeZone } as CareSnapshot) : s;
}

describe('calendar helpers', () => {
  test('adding days crosses months and years', () => {
    expect(addDays({ y: 2026, m: 6, d: 28 }, 7)).toEqual({ y: 2026, m: 7, d: 5 });
    expect(addDays({ y: 2026, m: 12, d: 30 }, 3)).toEqual({ y: 2027, m: 1, d: 2 });
    expect(daysBetween({ y: 2026, m: 6, d: 15 }, { y: 2026, m: 6, d: 17 })).toBe(2);
    expect(daysBetween({ y: 2026, m: 6, d: 17 }, { y: 2026, m: 6, d: 15 })).toBe(-2);
  });

  test('local dates resolve in the household zone, else on the device', () => {
    const ms = Date.parse('2026-06-10T16:00:00Z'); // 11:00 in Chicago, 01:00 next day in Tokyo
    expect(localDateOf(ms)).toEqual({ y: 2026, m: 6, d: 10 });
    expect(localDateOf(ms, 'Asia/Tokyo')).toEqual({ y: 2026, m: 6, d: 11 });
    expect(localDateOf(ms, 'Not/AZone')).toEqual({ y: 2026, m: 6, d: 10 });
  });

  test('10:00 on a date, in a zone, across DST and far-east offsets', () => {
    expect(instantOn({ y: 2026, m: 6, d: 17 }, '10:00')).toEqual(at(17, 10));
    expect(instantOn({ y: 2026, m: 6, d: 17 }, '10:00', 'Asia/Tokyo').toISOString()).toBe('2026-06-17T01:00:00.000Z');
    expect(instantOn({ y: 2026, m: 6, d: 17 }, '10:00', 'Pacific/Kiritimati').toISOString()).toBe(
      '2026-06-16T20:00:00.000Z',
    );
    // Chicago springs forward on 2026-03-08: 10:00 is CST before, CDT after.
    expect(instantOn({ y: 2026, m: 3, d: 1 }, '10:00', 'America/Chicago').toISOString()).toBe('2026-03-01T16:00:00.000Z');
    expect(instantOn({ y: 2026, m: 3, d: 15 }, '10:00', 'America/Chicago').toISOString()).toBe('2026-03-15T15:00:00.000Z');
  });
});

describe('habitat due math', () => {
  test('nothing is due before the first clean', () => {
    const s = snap(cat(), [], at(15, 12));
    expect(habitatDue(s.pet, s.logs, s.now)).toBeNull();
    expect(habitatModule.upcoming!(s)).toEqual([]);
    expect(habitatModule.hero!(s)).toBeNull();
    expect(habitatModule.reminders!(s, DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
  });

  test('due at 10:00 on the date of the last clean + N days (time of day of the clean is irrelevant)', () => {
    for (const cleanedAt of [at(10, 0, 5), at(10, 15), at(10, 23, 59)]) {
      const due = habitatDue(cat(), [clean('c1', cleanedAt)], at(15, 12))!;
      expect(due.dueOn).toEqual({ y: 2026, m: 6, d: 17 });
      expect(due.dueAt).toEqual(at(17, 10));
      expect(due.daysUntil).toBe(2);
      expect(due.kind).toBe('upcoming');
      expect(due.overdueBy).toBe(0);
    }
  });

  test('the most recent non-deleted clean is the anchor', () => {
    const logs = [clean('c1', at(3, 9)), clean('c2', at(10, 9)), clean('c3', at(12, 9), { deletedAt: at(12, 10).toISOString() })];
    expect(habitatDue(cat(), logs, at(15, 12))!.dueAt).toEqual(at(17, 10));
  });

  test('the interval comes from the pet, else the species suggestion', () => {
    expect(rhythmsForPet(cat({ habitatIntervalDays: 3 })).habitatIntervalDays).toBe(3);
    expect(rhythmsForPet(cat({ habitatIntervalDays: null }), SPECIES_PROFILES.cat).habitatIntervalDays).toBe(7);
    expect(rhythmsForPet(mkPet({ id: 's', name: 'S', species: 'snake' }), SPECIES_PROFILES.snake).habitatIntervalDays).toBe(14);
    expect(rhythmsForPet(mkPet({ id: 's', name: 'S', species: 'snake' })).habitatIntervalDays).toBe(7);
    expect(rhythmsForPet(cat({ habitatIntervalDays: 500 })).habitatIntervalDays).toBe(90);
    expect(habitatDue(cat({ habitatIntervalDays: 1 }), [clean('c1', at(10, 9))], at(10, 12))!.dueAt).toEqual(at(11, 10));
  });

  test('a missed clean stays overdue on its date — it never rolls forward', () => {
    const logs = [clean('c1', at(10, 15))];
    for (const now of [at(17, 10, 1), at(18, 9), at(25, 12), localAt(2026, 8, 1, 12)]) {
      const due = habitatDue(cat(), logs, now)!;
      expect(due.dueAt).toEqual(at(17, 10));
      expect(due.kind).toBe('overdue');
      expect(due.overdueBy).toBe(now.getTime() - at(17, 10).getTime());
    }
  });

  test('the household zone decides the date and the 10:00', () => {
    // Cleaned 2026-06-10 16:00Z: the 10th in Chicago, the 11th in Tokyo.
    const logs = [mkLog('c1', 'luna', 'habitat_clean', '2026-06-10T16:00:00.000Z')];
    const now = at(15, 12);
    expect(habitatDue(cat(), logs, now, 'Asia/Tokyo')!.dueAt.toISOString()).toBe('2026-06-18T01:00:00.000Z');
    expect(habitatDue(cat(), logs, now)!.dueAt).toEqual(at(17, 10));
    expect(habitatDue(cat(), logs, now, 'Bad/Zone')!.dueAt).toEqual(at(17, 10));
    // Through the snapshot too.
    const [r] = habitatModule.reminders!(snap(cat(), logs, now, 'Asia/Tokyo'), DEFAULT_NOTIFICATION_PREFS);
    expect(r.fireAt.toISOString()).toBe('2026-06-18T01:00:00.000Z');
  });
});

describe('habitat outputs', () => {
  const logs = [clean('c1', at(10, 15))];

  test('hero and row before the due date: "Clean litter tray in 2 days"', () => {
    const s = snap(cat(), logs, at(15, 12));
    expect(habitatModule.hero!(s)).toMatchObject({
      moduleId: 'habitat',
      state: 'upcoming',
      kicker: 'Litter tray',
      headline: 'Clean litter tray in 2 days',
      detail: 'Every 7 days',
      late: false,
    });
    const [row] = habitatModule.upcoming!(s);
    expect(row).toMatchObject({ id: 'habitat', type: 'habitat_clean', label: 'Clean litter tray', kind: 'upcoming' });
    expect(row.timeStart).toEqual(at(17, 10));
  });

  test('tomorrow / today wording', () => {
    expect(habitatModule.hero!(snap(cat(), logs, at(16, 12)))!.headline).toBe('Clean litter tray tomorrow');
    expect(habitatModule.hero!(snap(cat(), logs, at(17, 9)))!.headline).toBe('Clean litter tray today');
  });

  test('overdue: "Litter tray cleaning is due", and it stays that way', () => {
    expect(habitatModule.hero!(snap(cat(), logs, at(17, 11)))).toMatchObject({
      state: 'late',
      late: true,
      progress: 1,
      headline: 'Litter tray cleaning is due',
      detail: 'due today',
    });
    expect(habitatModule.hero!(snap(cat(), logs, at(18, 11)))!.detail).toBe('due yesterday');
    expect(habitatModule.hero!(snap(cat(), logs, at(25, 11)))!.detail).toBe('due 8 days ago');
    const [row] = habitatModule.upcoming!(snap(cat(), logs, at(25, 11)));
    expect(row.kind).toBe('overdue');
    expect(row.timeStart).toEqual(at(17, 10));
  });

  test("the species' noun: fish clean the tank", () => {
    const fish = mkPet({ id: 'luna', name: 'Nemo', species: 'fish', careModules: ['habitat', 'meals'] });
    const s = snap(fish, logs, at(15, 12));
    expect(habitatModule.quickLog!(s)).toEqual([
      {
        key: 'habitat_clean',
        icon: 'sparkle',
        label: 'Cleaned tank',
        verb: 'get a clean tank',
        writes: [{ type: 'habitat_clean' }],
      },
    ]);
    expect(habitatModule.hero!(s)!.headline).toBe('Clean tank in 2 days');
  });

  test('reads only habitat_clean logs', () => {
    const all = [...logs, mkLog('w', 'luna', 'walk', at(14, 9)), mkLog('p', 'luna', 'pee', at(14, 10))];
    for (const now of [at(15, 12), at(17, 11)]) {
      expect(habitatModule.hero!(snap(cat(), all, now))).toEqual(habitatModule.hero!(snap(cat(), logs, now)));
      expect(habitatModule.upcoming!(snap(cat(), all, now))).toEqual(habitatModule.upcoming!(snap(cat(), logs, now)));
    }
  });
});

describe('habitat reminders (local, behind CARE_RHYTHMS)', () => {
  const logs = [clean('c1', at(10, 15))];

  test('fires once, at 10:00 on the due date', () => {
    const [r, ...rest] = habitatModule.reminders!(snap(cat(), logs, at(15, 12)), DEFAULT_NOTIFICATION_PREFS);
    expect(rest).toEqual([]);
    expect(r.key).toBe('habitat:luna');
    expect(r.fireAt).toEqual(at(17, 10));
    expect(r.title).toBe('Time to clean the litter tray 🧽');
    expect(r.data).toMatchObject({ kind: 'care_due', careModule: 'habitat', petId: 'luna', reconcileKey: 'habitat:luna' });
  });

  test('once 10:00 has passed nothing is re-scheduled (it stays overdue in the app)', () => {
    expect(habitatModule.reminders!(snap(cat(), logs, at(17, 10, 1)), DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
    expect(habitatModule.reminders!(snap(cat(), logs, at(20, 9)), DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
  });

  test('quiet hours covering 10:00 suppress it', () => {
    const quiet: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, quietHoursStart: '22:00', quietHoursEnd: '10:30' };
    expect(habitatModule.reminders!(snap(cat(), logs, at(15, 12)), quiet)).toEqual([]);
  });
});

describe('habitat in the care plan', () => {
  test('new cats start with habitat; existing pets do not gain it', () => {
    expect(defaultCareModules('cat')).toEqual(['habitat', 'meals', 'meds', 'visits']);
    expect(defaultCareModules('fish')).toEqual(['habitat', 'meals']);
    expect(resolvePlan(mkPet({ id: 'old', name: 'Old', species: 'cat' })).map((m) => m.id)).not.toContain('habitat');
  });

  test('a new cat: the habitat hero leads (nothing above it speaks), the row shows, quick log offers it', () => {
    const pet = cat();
    const plan = resolvePlan(pet);
    const s = snap(pet, [clean('c1', at(10, 15))], at(15, 12));
    expect(heroFor(plan, s).moduleId).toBe('habitat');
    expect(planUpcoming(plan, s).map((r) => [r.id, r.lineIcon])).toEqual([['habitat', 'sparkle']]);
    expect(planQuickLog(plan, s).map((a) => a.key)).toEqual(['fed', 'habitat_clean']);
  });
});
