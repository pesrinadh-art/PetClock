/**
 * Release N tolerance (docs/CARE_MODULES_PLAN.md, "Contract changes"): this build must survive
 * log types and push kinds that a LATER release introduces, before any are added.
 */
import { toLogEntry } from '../db/models';
import { isPawClockPush, PUSH_PAYLOAD_VERSION } from '../../shared/notificationContracts';
import {
  LOG_TYPE_PRESENTATION,
  OTHER_LOG_PRESENTATION,
  presentLogType,
  type LogTypePresentation,
} from '../care/logTypes';
import { nudgeLineIcon, type PendingNudge } from '../notifications/pending';

const logRow = (type: unknown) => ({
  id: '00000000-0000-4000-8000-000000000001',
  household_id: 'h1',
  pet_id: 'p1',
  type,
  occurred_at: '2026-01-01T12:00:00.000Z',
  note: null,
  source: 'manual',
  feed_time_id: null,
  medication_id: null,
  notification_id: null,
  created_by: 'u1',
  created_at: '2026-01-01T12:00:00.000Z',
  deleted_at: null,
});

describe('toLogEntry narrowing', () => {
  test.each(['pee', 'poo', 'food', 'medication', 'vet', 'other'])('keeps known type %s', (t) => {
    expect(toLogEntry(logRow(t)).type).toBe(t);
  });

  test.each([['walk'], ['habitat_clean'], [''], ['PEE'], [null], [undefined], [42], ['toString'], ['__proto__']])(
    'narrows unknown type %p to other',
    (t) => {
      expect(toLogEntry(logRow(t)).type).toBe('other');
    },
  );

  test('leaves every other field untouched', () => {
    const e = toLogEntry(logRow('walk'));
    expect(e).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      householdId: 'h1',
      petId: 'p1',
      type: 'other',
      occurredAt: '2026-01-01T12:00:00.000Z',
      note: null,
      source: 'manual',
      feedTimeId: null,
      medicationId: null,
      notificationId: null,
      createdBy: 'u1',
      createdAt: '2026-01-01T12:00:00.000Z',
      deletedAt: null,
    });
  });
});

describe('isPawClockPush', () => {
  const base = { v: PUSH_PAYLOAD_VERSION, notificationId: 'n1', actionToken: 't' };

  test.each(['break_prediction', 'meal', 'medication', 'appointment', 'digest', 'med_escalation'])(
    'accepts known kind %s',
    (kind) => {
      expect(isPawClockPush({ ...base, kind })).toBe(true);
    },
  );

  test.each([['care_due'], ['walk'], [''], ['toString'], ['__proto__'], [1], [null], [undefined]])(
    'rejects unknown kind %p',
    (kind) => {
      expect(isPawClockPush({ ...base, kind })).toBe(false);
    },
  );

  test('still rejects bad shapes', () => {
    expect(isPawClockPush(null)).toBe(false);
    expect(isPawClockPush('x')).toBe(false);
    expect(isPawClockPush({ ...base, kind: 'meal', v: 2 })).toBe(false);
    expect(isPawClockPush({ ...base, kind: 'meal', notificationId: 1 })).toBe(false);
    expect(isPawClockPush({ ...base, kind: 'meal', actionToken: undefined })).toBe(false);
  });
});

describe('log type presentation', () => {
  test('known types render exactly as before', () => {
    // Values previously hard-coded in history.tsx LOG_VISUAL / Timeline.tsx TYPE_STYLE.
    const pick = (p: LogTypePresentation) => p.icon;
    expect(pick(presentLogType('pee'))).toBe('drop');
    expect(pick(presentLogType('poo'))).toBe('poo');
    expect(pick(presentLogType('food'))).toBe('bowl');
    expect(pick(presentLogType('medication'))).toBe('pill');
    expect(pick(presentLogType('vet'))).toBe('vet');
    expect(pick(presentLogType('other'))).toBe('dots');
    expect(presentLogType('pee')).toBe(LOG_TYPE_PRESENTATION.pee);
  });

  test('unknown types fall back to the other row', () => {
    expect(presentLogType('walk')).toBe(OTHER_LOG_PRESENTATION);
    expect(presentLogType('toString')).toBe(OTHER_LOG_PRESENTATION);
  });

  test('a view-specific other row applies to other and unknown alike', () => {
    const mine: LogTypePresentation = { icon: 'paw', label: 'Log', bg: 'a', fg: 'b' };
    expect(presentLogType('other', mine)).toBe(mine);
    expect(presentLogType('walk', mine)).toBe(mine);
    expect(presentLogType('pee', mine)).toBe(LOG_TYPE_PRESENTATION.pee);
  });
});

describe('nudgeLineIcon', () => {
  const nudge = (data: Record<string, unknown>, subtitle = 'irrelevant'): PendingNudge =>
    ({
      key: 'k',
      petId: 'p1',
      petName: 'Mochi',
      kind: 'break',
      icon: '',
      title: '',
      subtitle,
      overdueBy: 0,
      data: data as unknown as PendingNudge['data'],
    }) as PendingNudge;

  test('derives from the payload, not the subtitle', () => {
    expect(nudgeLineIcon(nudge({ kind: 'break_prediction', breakType: 'pee' }, 'Poo break'))).toBe('drop');
    expect(nudgeLineIcon(nudge({ kind: 'break_prediction', breakType: 'poo' }, 'Pee break'))).toBe('poo');
    expect(nudgeLineIcon(nudge({ kind: 'meal' }))).toBe('bowl');
    expect(nudgeLineIcon(nudge({ kind: 'medication' }))).toBe('pill');
  });

  test('unknown payload kinds fall back to the other row', () => {
    expect(nudgeLineIcon(nudge({ kind: 'care_due' }))).toBe(OTHER_LOG_PRESENTATION.icon);
  });
});
