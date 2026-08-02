const DAY_MS = 24 * 60 * 60 * 1000;

export type Countdown = { label: string; kind: 'soon' | 'upcoming' | 'overdue' };

/** Parses form-boundary strings "Jul 4, 2026" + "10:00 AM" (time optional) into a Date, or null if unparseable. */
export function parseAppointmentDateTime(date: string, time?: string): Date | null {
  if (!date.trim()) return null;
  const parsed = new Date(time ? `${date} ${time}` : date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `now`'s day to `startsAt`'s day (negative = past). */
function calendarDayDiff(startsAtMs: number, now: number): number {
  return Math.round((startOfDay(startsAtMs) - startOfDay(now)) / DAY_MS);
}

/**
 * Buckets an appointment's `startsAt` (ISO) into soon/upcoming/overdue at render time.
 * Pure: pass `now` to pin the clock (e.g. from a useNow tick); defaults to Date.now().
 * Same-day appointments stay "Today" until the day ends rather than flipping to overdue mid-day.
 */
export function computeCountdown(startsAt: string, now: number = Date.now()): Countdown {
  const startsAtMs = new Date(startsAt).getTime();
  const diffDays = calendarDayDiff(startsAtMs, now);
  if (diffDays < 0) return { label: 'Overdue!', kind: 'overdue' };
  if (diffDays === 0) return { label: 'Today', kind: 'soon' };
  if (diffDays === 1) return { label: 'Tomorrow', kind: 'soon' };
  if (diffDays <= 3) return { label: `In ${diffDays} days`, kind: 'soon' };
  return { label: formatApptDate(startsAt, { month: 'short', day: 'numeric' }), kind: 'upcoming' };
}

/** Formats an appointment's `startsAt` (ISO) for display, e.g. "Fri, Jul 4". */
export function formatApptDate(
  startsAt: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
): string {
  return new Date(startsAt).toLocaleDateString('en-US', options);
}

/** Formats an appointment's time of day, e.g. "10:00 AM". */
export function formatApptTime(startsAt: string): string {
  return new Date(startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
