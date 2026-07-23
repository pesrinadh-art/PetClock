import { useCallback } from 'react';
import { useAppointments } from '../context/AppointmentsContext';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';

/**
 * Cross-context cascade for pet deletion (D10). The delete confirmation in
 * pets.tsx promises "deletes their profile and log history", so removing the
 * pet must also remove its logs and detach it from appointments (dropping any
 * appointment left with no pets) instead of leaving orphans.
 *
 * Returns the same boolean as `removePet`: false means the delete was blocked
 * (last remaining pet) and nothing was cascaded.
 */
export function useDeletePetCascade() {
  const { removePet } = usePets();
  const { removeLogsForPet } = useLogs();
  const { removePetFromAppointments } = useAppointments();

  return useCallback(
    (petId: string): boolean => {
      const removed = removePet(petId);
      if (!removed) return false;
      removeLogsForPet(petId);
      removePetFromAppointments(petId);
      // TODO(FE-3): cancel all scheduled OS notifications for this pet once the
      // notification scheduler exists (plan §2.6 — scheduler.cancelForPet(petId)).
      return true;
    },
    [removePet, removeLogsForPet, removePetFromAppointments]
  );
}
