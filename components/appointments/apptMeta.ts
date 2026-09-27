import type { Tone } from '../../theme/colors';
import type { IconName } from '../Icon';
import type { ApptType } from '../../data/mockData';

/**
 * Presentation metadata for each visit type: friendly labels, the role tone
 * (vet / vaccine / groom / other), the icon, and a few quick title ideas so
 * owners can fill the form with one tap.
 */
export const APPT_TYPE_META: Record<
  ApptType,
  {
    label: string;
    short: string;
    plural: string;
    icon: IconName;
    tone: Tone;
    placeholder: string;
    suggestions: string[];
  }
> = {
  vet: {
    label: 'Vet visit',
    short: 'Vet',
    plural: 'vet visits',
    icon: 'vet',
    tone: 'vet',
    placeholder: 'e.g. Annual check-up',
    suggestions: ['Annual check-up', 'Follow-up visit', 'Dental check'],
  },
  vaccine: {
    label: 'Vaccine',
    short: 'Vaccine',
    plural: 'vaccines',
    icon: 'vaccine',
    tone: 'vaccine',
    placeholder: 'e.g. Rabies booster',
    suggestions: ['Rabies booster', 'Yearly vaccines', 'Booster shot'],
  },
  groom: {
    label: 'Grooming',
    short: 'Grooming',
    plural: 'grooming visits',
    icon: 'scissors',
    tone: 'groom',
    placeholder: 'e.g. Bath and nail trim',
    suggestions: ['Bath and brush', 'Nail trim', 'Full groom'],
  },
  other: {
    label: 'Other',
    short: 'Other',
    plural: 'other visits',
    icon: 'dots',
    tone: 'other',
    placeholder: 'e.g. Training class',
    suggestions: ['Training class', 'Pet sitter', 'Boarding drop-off'],
  },
};

export const APPT_TYPE_ORDER: ApptType[] = ['vet', 'vaccine', 'groom', 'other'];

/** "JUL" / "4" parts for the calendar date tile. */
export function dateTileParts(startsAt: string): { month: string; day: string; weekday: string } {
  const d = new Date(startsAt);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
  };
}
