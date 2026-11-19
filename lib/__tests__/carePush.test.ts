/// <reference types="jest" />
/// <reference types="node" />
/**
 * Care modules Phase 3, client side — the `care_due` push (walks / habitat cleaning).
 *
 *  - The 'care-check' category is registered with Done (LOG_YES) and Snooze (SNOOZE_15), both
 *    headless (the app stays closed), mirroring the break category.
 *  - Done on a server push goes to log-action with a deterministic clientLogId, the SAME id on a
 *    retry of the same tap; when log-action cannot be reached it writes the walk / habitat_clean
 *    log locally. Snooze on a server push goes to log-action; locally it re-arms like a break.
 *  - A body tap opens Today on the pet.
 *  - Local walk / habitat reminders stand down while server pushes are active and keep working
 *    in local mode.
 */
import type { LogEntry, Pet } from '../db/models';
import { ACTION, ANDROID_CHANNEL, CATEGORY, PUSH_PAYLOAD_VERSION } from '../../shared/notificationContracts';
import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/scheduler';
import { buildSnapshot } from '../care/plan';
import { walksModule } from '../care/modules/walks';
import { habitatModule } from '../care/modules/habitat';
import { careReminder } from '../care/modules/localReminder';
import { careDesiredNotifications } from '../care/household';
import { setServerPushActive } from '../push/mode';
import { localAt, mkLog, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_alg: string, seed: string) =>
    require('crypto').createHash('sha256').update(seed).digest('hex'),
  ),
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));
jest.mock('../repo/types', () => ({ repos: { logs: { add: jest.fn(() => Promise.resolve()) } } }));
jest.mock('../push/logAction', () => ({
  ...jest.requireActual('../push/logAction'),
  postLogAction: jest.fn(),
}));
jest.mock('../notifications/scheduler', () => ({
  ...jest.requireActual('../notifications/scheduler'),
  scheduleSnoozeFollowup: jest.fn(() => Promise.resolve()),
}));

// Imported after the mocks so they bind to them.
/* eslint-disable import/first */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { repos } from '../repo/types';
import { postLogAction } from '../push/logAction';
import { scheduleSnoozeFollowup } from '../notifications/scheduler';
import { registerNotificationCategories } from '../notifications/categories';
import { handleNotificationResponse, tapThroughUrl } from '../notifications/responseHandler';
import { careLogTypeFor, logYes, occurredAtFor } from '../notifications/actions';
import { getActiveSnoozes } from '../notifications/snoozeStore';

const addLog = repos.logs.add as jest.Mock;
const post = postLogAction as jest.Mock;
const navigate = router.navigate as jest.Mock;
const followup = scheduleSnoozeFollowup as jest.Mock;

const PET = '11111111-1111-4111-8111-111111111111';

/** A server care_due push exactly as dispatch-notifications sends it (no url, no reconcileKey). */
function serverPush(extra: Record<string, unknown> = {}) {
  return {
    v: PUSH_PAYLOAD_VERSION,
    kind: 'care_due',
    notificationId: '22222222-2222-4222-8222-222222222222',
    actionToken: 'header.claims.sig',
    householdId: '00000000-0000-4000-8000-0000000000aa',
    petId: PET,
    petName: 'Rex',
    careModule: 'walks',
    dueOn: '2026-06-15T15:00:00.000Z',
    ...extra,
  };
}

let seq = 0;
function response(data: unknown, actionIdentifier: string, identifier = `n-${++seq}`) {
  return {
    actionIdentifier,
    notification: { request: { identifier, content: { data } } },
  } as unknown as Notifications.NotificationResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  // The fallback paths warn in dev by design; keep the test output readable.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setServerPushActive(false);
  process.env.EXPO_PUBLIC_USE_SUPABASE = 'true';
});

afterAll(() => setServerPushActive(false));

describe('care-check category', () => {
  test('registers Done and Snooze, both headless, alongside the existing categories', async () => {
    await registerNotificationCategories();
    const calls = (Notifications.setNotificationCategoryAsync as jest.Mock).mock.calls;
    const byId = new Map(calls.map(([id, actions]) => [id, actions]));
    expect(CATEGORY.care).toBe('care-check');
    expect(byId.get(CATEGORY.care)).toEqual([
      { identifier: ACTION.yes, buttonTitle: '✅ Done', options: { opensAppToForeground: false } },
      { identifier: ACTION.snooze, buttonTitle: '⏰ Snooze 15 min', options: { opensAppToForeground: false } },
    ]);
    // The flagship break category is untouched.
    expect(byId.get(CATEGORY.break)).toHaveLength(3);
    expect(byId.get(CATEGORY.appointment)).toEqual([]);
  });

  test('the server channel exists in the contract', () => {
    expect(ANDROID_CHANNEL.care_due.id).toBe('care_due');
  });
});

describe('care_due log type', () => {
  test('each module writes only its own log type; unknown modules write nothing', () => {
    expect(careLogTypeFor('walks')).toBe('walk');
    expect(careLogTypeFor('habitat')).toBe('habitat_clean');
    expect(careLogTypeFor('potty')).toBeNull();
    expect(careLogTypeFor('grooming')).toBeNull();
    expect(careLogTypeFor(undefined)).toBeNull();
  });

  test('Done is stamped at the tap, not at the reminder fire time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T16:00:00.000Z'));
    try {
      const at = occurredAtFor({ ...serverPush(), fireAtMs: Date.parse('2026-06-15T14:40:00.000Z') } as never);
      expect(at).toBe('2026-06-15T16:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Done on a server care_due push', () => {
  test('goes to log-action as LOG_YES and writes nothing locally', async () => {
    post.mockResolvedValue({ status: 'ok', response: { ok: true, logId: 'x', nextPrediction: null, replayed: false } });
    await handleNotificationResponse(response(serverPush(), ACTION.yes));
    expect(post).toHaveBeenCalledTimes(1);
    const req = post.mock.calls[0][0];
    expect(req.action).toBe('LOG_YES');
    expect(req.actionToken).toBe('header.claims.sig');
    expect(req.clientLogId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(typeof req.occurredAt).toBe('string');
    expect(addLog).not.toHaveBeenCalled();
  });

  test('a replay of the same tap (another delivery) presents the same clientLogId', async () => {
    post.mockResolvedValue({ status: 'failed', reason: 'offline' });
    // First delivery fails at the server and is written locally; a later delivery of a
    // DIFFERENT OS notification for the same push row must still derive the same id.
    await handleNotificationResponse(response(serverPush(), ACTION.yes, 'os-a'));
    await handleNotificationResponse(response(serverPush(), ACTION.yes, 'os-b'));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][0].clientLogId).toBe(post.mock.calls[1][0].clientLogId);
  });

  test('a duplicate delivery of the same OS response is processed once', async () => {
    post.mockResolvedValue({ status: 'ok', response: { ok: true, logId: 'x', nextPrediction: null, replayed: false } });
    const r = response(serverPush(), ACTION.yes, 'os-dup');
    await Promise.all([handleNotificationResponse(r), handleNotificationResponse(r)]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test('falls back to a local walk log when log-action cannot be reached', async () => {
    post.mockResolvedValue({ status: 'failed', reason: 'offline' });
    await handleNotificationResponse(response(serverPush(), ACTION.yes));
    expect(addLog).toHaveBeenCalledTimes(1);
    const [petId, input] = addLog.mock.calls[0];
    expect(petId).toBe(PET);
    expect(input).toMatchObject({
      type: 'walk',
      source: 'notification_yes',
      notificationId: '22222222-2222-4222-8222-222222222222',
    });
  });

  test('habitat writes a habitat_clean log on fallback', async () => {
    post.mockResolvedValue({ status: 'rejected', reason: 'TOKEN_EXPIRED' });
    await handleNotificationResponse(response(serverPush({ careModule: 'habitat' }), ACTION.yes));
    expect(addLog.mock.calls[0][1]).toMatchObject({ type: 'habitat_clean' });
  });
});

describe('Snooze on a server care_due push', () => {
  test('goes to log-action as SNOOZE_15 (the server re-asks)', async () => {
    post.mockResolvedValue({ status: 'ok', response: { ok: true, logId: null, nextPrediction: null, replayed: false } });
    await handleNotificationResponse(response(serverPush(), ACTION.snooze));
    expect(post.mock.calls[0][0]).toMatchObject({ action: 'SNOOZE_15', occurredAt: undefined });
    expect(addLog).not.toHaveBeenCalled();
    expect(followup).not.toHaveBeenCalled();
  });

  test('re-arms locally in 15 minutes when log-action cannot be reached, like a break', async () => {
    post.mockResolvedValue({ status: 'failed', reason: 'offline' });
    const before = Date.now();
    await handleNotificationResponse(response(serverPush(), ACTION.snooze));
    expect(followup).toHaveBeenCalledTimes(1);
    const [data, untilMs] = followup.mock.calls[0];
    expect(data.kind).toBe('care_due');
    expect(untilMs).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(untilMs).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    expect(addLog).not.toHaveBeenCalled();
  });
});

describe('body tap', () => {
  test('a server care_due push opens Today on its pet', async () => {
    await handleNotificationResponse(response(serverPush(), 'expo.modules.notifications.actions.DEFAULT'));
    expect(post).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`/?pet=${PET}`);
  });

  test('a payload url wins; other kinds without a url do not navigate', () => {
    expect(tapThroughUrl({ kind: 'care_due', url: '/?pet=rex', petId: 'x' })).toBe('/?pet=rex');
    expect(tapThroughUrl({ kind: 'care_due' })).toBe('/');
    expect(tapThroughUrl({ kind: 'break_prediction', petId: PET })).toBeNull();
    expect(tapThroughUrl({ kind: 'meal', url: '/meals' })).toBe('/meals');
  });
});

describe('local care reminders (no token)', () => {
  test('Done writes the log through the repo and clears its snooze', async () => {
    const local = { ...serverPush(), actionToken: '', reconcileKey: 'walk:rex', url: '/?pet=rex', fireAtMs: 1 };
    await logYes(local as never);
    expect(post).not.toHaveBeenCalled();
    expect(addLog.mock.calls[0][1]).toMatchObject({ type: 'walk' });
    expect((await getActiveSnoozes())['walk:rex']).toBeUndefined();
  });

  test('an unknown care module writes nothing', async () => {
    await logYes({ ...serverPush({ careModule: 'grooming' }), actionToken: '' } as never);
    expect(addLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Local vs server: exactly one owner
// ---------------------------------------------------------------------------

const D = (h: number, m = 0) => localAt(2026, 6, 15, h, m);

const dog = (): Pet =>
  mkPet({
    id: 'rex',
    name: 'Rex',
    species: 'dog',
    careModules: ['potty', 'walks', 'habitat', 'meals', 'meds', 'visits'],
    walkIntervalHours: 3,
    habitatIntervalDays: 2,
  });

const logs: LogEntry[] = [mkLog('w1', 'rex', 'walk', D(8)), mkLog('c1', 'rex', 'habitat_clean', localAt(2026, 6, 14, 9))];
const snap = () => buildSnapshot({ pet: dog(), feedTimes: [], meds: [], logs, appts: [], now: D(9) });

describe('walk / habitat local reminders stand down in server mode', () => {
  test('local mode: both modules schedule their reminder', () => {
    expect(walksModule.reminders!(snap(), DEFAULT_NOTIFICATION_PREFS)).toHaveLength(1);
    expect(habitatModule.reminders!(snap(), DEFAULT_NOTIFICATION_PREFS)).toHaveLength(1);
    const keys = careDesiredNotifications([dog()], [], [], logs, [], DEFAULT_NOTIFICATION_PREFS, D(9)).map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['walk:rex', 'habitat:rex']));
  });

  test('server mode: neither schedules a local copy', () => {
    setServerPushActive(true);
    expect(walksModule.reminders!(snap(), DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
    expect(habitatModule.reminders!(snap(), DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
    const keys = careDesiredNotifications([dog()], [], [], logs, [], DEFAULT_NOTIFICATION_PREFS, D(9)).map((d) => d.key);
    expect(keys).not.toContain('walk:rex');
    expect(keys).not.toContain('habitat:rex');
  });

  test('flipping back to local mode restores them', () => {
    setServerPushActive(true);
    setServerPushActive(false);
    const r = careReminder({
      pet: dog(),
      careModule: 'walks',
      key: 'walk:rex',
      fireAt: D(10),
      dueAt: D(11),
      title: 't',
      body: 'b',
      prefs: DEFAULT_NOTIFICATION_PREFS,
      now: D(9),
    });
    expect(r).toHaveLength(1);
    expect(r[0].data).toMatchObject({ kind: 'care_due', careModule: 'walks', actionToken: '' });
  });
});
