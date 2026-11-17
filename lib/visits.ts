import type { Appointment, ApptType } from './db/models';
import type { IconName } from '../components/Icon';
import { category } from '../theme/colors';

/** Display metadata per visit type: label, drawn icon and role tint. */
export const VISIT_META: Record<ApptType, { label: string; plural: string; icon: IconName; ink: string; bg: string }> = {
  vet: { label: 'Vet visit', plural: 'Vet', icon: 'vet', ink: category.vetInk, bg: category.vetBg },
  vaccine: { label: 'Vaccine', plural: 'Vaccines', icon: 'vaccine', ink: category.vaccineInk, bg: category.vaccineBg },
  groom: { label: 'Grooming', plural: 'Grooming', icon: 'scissors', ink: category.groomInk, bg: category.groomBg },
  other: { label: 'Other', plural: 'Other', icon: 'dots', ink: category.otherInk, bg: category.otherBg },
};

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Still on the books: not deleted and not marked done. */
export function isActiveVisit(a: Appointment): boolean {
  return !a.deletedAt && a.completedAt == null;
}

/**
 * A visit whose day has passed without being marked done "needs a new date". Same-day visits
 * stay current until the day ends (matches computeCountdown's "Today").
 */
export function needsNewDate(a: Appointment, now: number = Date.now()): boolean {
  return isActiveVisit(a) && startOfDay(new Date(a.startsAt).getTime()) < startOfDay(now);
}

/** Active visits from today onward, soonest first. */
export function upcomingVisits(appts: Appointment[], now: number = Date.now()): Appointment[] {
  return appts
    .filter((a) => isActiveVisit(a) && !needsNewDate(a, now))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}
