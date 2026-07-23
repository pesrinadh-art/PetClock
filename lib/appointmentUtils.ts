const DAY_MS = 24 * 60 * 60 * 1000;

export type Countdown = { label: string; kind: 'soon' | 'upcoming' | 'overdue' };

/** Parses "Jul 4, 2026" + "10:00 AM" (time optional) into a Date, or null if unparseable. */
export function parseAppointmentDateTime(date: string, time?: string): Date | null {
  if (!date.trim()) return null;
  const parsed = new Date(time ? `${date} ${time}` : date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Buckets a target date/time into the same soon/upcoming/overdue scheme used by the demo data. */
export function computeCountdown(target: Date, now: Date = new Date()): Countdown {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs < 0) return { label: 'Overdue!', kind: 'overdue' };

  const diffDays = Math.floor(diffMs / DAY_MS);
  if (diffDays === 0) return { label: 'Today', kind: 'soon' };
  if (diffDays === 1) return { label: 'Tomorrow', kind: 'soon' };
  if (diffDays <= 3) return { label: `In ${diffDays} days`, kind: 'soon' };
  return { label: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), kind: 'upcoming' };
}
