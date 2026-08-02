import { useCallback } from 'react';
import { usePets } from '../context/PetsContext';
import { repos } from '../lib/repo/types';

/**
 * Cross-collection cascade for pet deletion (D10). The delete confirmation in
 * pets.tsx promises "deletes their profile and log history", so removing the pet
 * must also remove its logs and detach it from appointments (dropping any
 * appointment left with no pets) instead of leaving orphans.
 *
 * The cascade itself now lives in the repository (`repos.pets.deleteCascade`),
 * which persists and notifies all three collections in one operation — the
 * contexts re-hydrate via their subscriptions. This hook keeps the same
 * boolean/last-pet-guard semantics for the UI: false means the delete was
 * blocked (last remaining pet) and nothing was cascaded.
 */
export function useDeletePetCascade() {
  const { pets } = usePets();

  return useCallback(
    (petId: string): boolean => {
      // UI-facing guard mirrors the repo's authoritative, race-safe guard.
      if (pets.length <= 1 || !pets.some((p) => p.id === petId)) return false;
      // Fire-and-forget: the repo cascade persists pet + logs + appointments and
      // notifies each collection's subscribers.
      void repos.pets.deleteCascade(petId);
      // TODO(FE-3): cancel all scheduled OS notifications for this pet once the
      // notification scheduler exists (plan §2.6 — scheduler.cancelForPet(petId)).
      return true;
    },
    [pets],
  );
}
