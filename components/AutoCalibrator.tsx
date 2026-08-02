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
  const { pets, updatePet, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet } = useLogs();

  useEffect(() => {
    const now = new Date();
    for (const pet of pets) {
      const feedTimes = getFeedTimesForPet(pet.id);
      if (getPetStatus(pet, feedTimes, now).kind !== 'needsInfo') continue;

      const inferred = inferScheduleFromLogs(getLogsForPet(pet.id));
      if (!inferred) continue;

      // Feed times/medications write through their own collections (via updatePet). Meds are
      // left unchanged — pass the existing rows back as primitive inputs.
      updatePet(pet.id, {
        name: pet.name,
        avatarEmoji: pet.avatarEmoji,
        breed: pet.breed ?? '',
        feedTimes: inferred.feedTimes,
        peeHoldHours: inferred.peeHoldHours,
        poopHoldHours: inferred.poopHoldHours,
        medications: getMedicationsForPet(pet.id).map((m) => ({
          name: m.name,
          localTime: m.localTime,
          dosage: m.dosage,
        })),
      });
    }
  }, [pets, getLogsForPet, getFeedTimesForPet, getMedicationsForPet, updatePet]);

  return null;
}
