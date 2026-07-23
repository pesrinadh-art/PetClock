import { useEffect } from 'react';
import { usePets } from '../context/PetsContext';
import { useLogs } from '../context/LogsContext';
import { getPetStatus, inferScheduleFromLogs } from '../lib/petSchedule';

/**
 * Renders nothing — just watches for pets whose 3-day calibration window has passed and, if
 * they've logged enough activity in that time, auto-fills their schedule from it instead of
 * leaving them stuck on the "needs setup" prompt forever. This is what actually makes good on
 * the calibrating message's promise to start predicting once there's enough logged history.
 */
export function AutoCalibrator() {
  const { pets, updatePet } = usePets();
  const { getLogsForPet } = useLogs();

  useEffect(() => {
    const now = new Date();
    for (const pet of pets) {
      if (getPetStatus(pet, now).kind !== 'needsInfo') continue;

      const inferred = inferScheduleFromLogs(getLogsForPet(pet.id));
      if (!inferred) continue;

      updatePet(pet.id, {
        name: pet.name,
        avatar: pet.avatar,
        breed: pet.breed,
        age: pet.age,
        feedTimes: inferred.feedTimes,
        peeHoldHours: inferred.peeHoldHours,
        poopHoldHours: inferred.poopHoldHours,
        medications: pet.medications,
      });
    }
  }, [pets, getLogsForPet, updatePet]);

  return null;
}
