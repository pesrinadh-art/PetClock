/**
 * Visits module — vet / groom / vaccine appointments (calendar engine).
 *
 * Today appointments have no Upcoming row, hero, quick log or nudge; they only have reminder
 * pushes. A household appointment with no pet is not owned by any pet's module: the
 * household composition (lib/care/household.ts) always sends it.
 */
import { appointmentReminders, appointmentsForPet } from '../engines/calendar';
import type { CareModule } from '../types';
import { ALL_SPECIES } from './allSpecies';

export const visitsModule: CareModule = {
  id: 'visits',
  priority: 60,
  appliesTo: ALL_SPECIES,
  logTypes: ['vet'],

  reminders: (s, prefs) => appointmentReminders(appointmentsForPet(s.appts, s.pet.id), prefs, s.now),
};
