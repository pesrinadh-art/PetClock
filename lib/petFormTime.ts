import { parseClockTime } from './petSchedule';

/**
 * Shared time-format helpers for the pet forms (onboarding + add-pet).
 *
 * `TimePickerField` speaks the human "h:mm AM/PM"; storage (FeedTime/Medication.localTime)
 * is "HH:MM" 24-hour. These two conversions are the seam between them, extracted so every
 * form converts identically instead of copy-pasting the logic.
 */

/** "h:mm AM/PM" (picker) → "HH:MM" 24h (storage). Returns '' when blank/unparseable. */
export function to24h(display: string): string {
  const parsed = parseClockTime(display, new Date());
  if (!parsed) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

/** "HH:MM" 24h (storage) → "h:mm AM/PM" (picker). Returns '' when blank/unparseable. */
export function to12h(stored: string): string {
  const parsed = parseClockTime(stored, new Date());
  if (!parsed) return '';
  const h = parsed.getHours();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(parsed.getMinutes()).padStart(2, '0')} ${period}`;
}
