/// <reference types="jest" />
/**
 * Phase 0.5 feed-time timezone parity: parseClockTimeInZone must resolve a wall clock the way
 * the server's `(date_trunc('day', now() at time zone tz) + local_time) at time zone tz` does,
 * including Postgres's DST rules (gap -> pre-transition offset, ambiguous -> post-transition).
 */
import { parseClockTime, parseClockTimeInZone } from '../petSchedule';

const at = (iso: string) => new Date(iso);

describe('parseClockTimeInZone', () => {
  test('resolves on the household-local date, in the household zone', () => {
    // 15:00 Chicago (device) = 13:00 Los Angeles; 07:30 LA = 14:30Z.
    expect(parseClockTimeInZone('07:30', at('2026-06-15T20:00:00.000Z'), 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-06-15T14:30:00.000Z',
    );
  });

  test('uses the household date even when the device is still on the previous day', () => {
    // 20:00Z = 15:00 Jun 15 in Chicago but 01:30 Jun 16 in Kolkata (UTC+5:30).
    expect(parseClockTimeInZone('7:30 AM', at('2026-06-15T20:00:00.000Z'), 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-06-16T02:00:00.000Z',
    );
  });

  test('matches device-local parsing when the zones coincide', () => {
    const ref = at('2026-06-15T15:00:00.000Z');
    for (const t of ['00:00', '06:15', '12:00', '6 PM', '23:59']) {
      expect(parseClockTimeInZone(t, ref, 'America/Chicago')?.toISOString()).toBe(parseClockTime(t, ref)?.toISOString());
    }
  });

  test('a time inside a spring-forward gap takes the pre-transition offset (Postgres rule)', () => {
    // 2026-03-08 02:30 does not exist in Chicago; Postgres reads it as 02:30 CST = 08:30Z (03:30 CDT).
    expect(parseClockTimeInZone('02:30', at('2026-03-08T18:00:00.000Z'), 'America/Chicago')?.toISOString()).toBe(
      '2026-03-08T08:30:00.000Z',
    );
  });

  test('an ambiguous fall-back time takes the post-transition offset (Postgres rule)', () => {
    // 2026-11-01 01:30 happens twice in Chicago; Postgres picks CST (UTC-6) = 07:30Z.
    expect(parseClockTimeInZone('01:30', at('2026-11-01T18:00:00.000Z'), 'America/Chicago')?.toISOString()).toBe(
      '2026-11-01T07:30:00.000Z',
    );
  });

  test('unparseable text is null; an unknown zone falls back to device-local', () => {
    const ref = at('2026-06-15T15:00:00.000Z');
    expect(parseClockTimeInZone('nope', ref, 'America/Chicago')).toBeNull();
    expect(parseClockTimeInZone('07:30', ref, 'Not/AZone')?.toISOString()).toBe(parseClockTime('07:30', ref)?.toISOString());
  });
});
