const DAY_MS = 24 * 60 * 60 * 1000;

export type Countdown = { label: string; kind: 'soon' | 'upcoming' | 'overdue' };

const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses form-boundary strings "Jul 4, 2026" (from DatePickerField) + "10:00 AM"
 * (from TimePickerField, optional) into a local Date, or null if unparseable.
 *
 * Parses these formats explicitly rather than delegating to `new Date(string)`:
 * Hermes (the engine on real devices) only reliably parses ISO 8601 and returns
 * Invalid Date for locale-formatted strings like "Jul 4, 2026", which made Save
 * stay disabled on device even though it worked under V8 on react-native-web.
 * A native `Date` parse remains as a fallback for any other (e.g. ISO) input.
 */
export function parseAppointmentDateTime(date: string, time?: string): Date | null {
  const d = date.trim();
  if (!d) return null;

  const dateMatch = d.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!dateMatch) {
    const fallback = new Date(d);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const monthIdx = MONTH_ABBR[dateMatch[1].slice(0, 3).toLowerCase()];
  if (monthIdx === undefined) return null;
  const day = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);

  let hour = 0;
  let minute = 0;
  const t = time?.trim();
  if (t) {
    const timeMatch = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (!timeMatch) return null;
    const rawHour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    if (rawHour < 1 || rawHour > 12 || minute > 59) return null;
    hour = rawHour % 12;
    if (timeMatch[3].toLowerCase() === 'pm') hour += 12;
  }

  const parsed = new Date(year, monthIdx, day, hour, minute, 0, 0);
  // Reject out-of-range days (e.g. "Feb 30") that JS would silently roll over.
  if (Number.isNaN(parsed.getTime()) || parsed.getMonth() !== monthIdx || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
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
