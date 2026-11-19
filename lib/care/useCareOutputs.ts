/**
 * useCareOutputs(petId) — the one hook Today, PetCard, UpcomingSection and QuickLogMenu will
 * read (plan, "How screens use it"). Everything is derived in one memo over the pet's snapshot
 * and `useNow()`; the plan itself is memoised on the pet's species + careModules.
 *
 * The result deliberately carries no species and no log types (plan, "Guardrails" 2): `plan`
 * is a {@link CarePlanView} of module ids only.
 */
import { useMemo } from 'react';
import { useAppointments } from '../../context/AppointmentsContext';
import { useLogs } from '../../context/LogsContext';
import { usePets } from '../../context/PetsContext';
import { useHouseholdTimeZone } from '../../context/SessionContext';
import { useNow } from '../../hooks/useNow';
import type { PetStatus } from '../petSchedule';
import {
  buildSnapshot,
  heroFor,
  petStatus,
  planQuickLog,
  planUpcoming,
  planView,
  resolvePlan,
  type CarePlanView,
} from './plan';
import type { CareUpcomingItem, HeroModel, QuickLogAction } from './types';

export type CareOutputs = {
  hero: HeroModel;
  upcoming: CareUpcomingItem[];
  quickLog: QuickLogAction[];
  status: PetStatus;
  plan: CarePlanView;
};

const NO_LOGS: never[] = [];

/** Null when `petId` names no current pet. */
export function useCareOutputs(petId: string | null | undefined): CareOutputs | null {
  const { pets, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const { appointments } = useAppointments();
  const now = useNow();
  const timeZone = useHouseholdTimeZone();

  const pet = pets.find((p) => p.id === petId) ?? null;
  const species = pet?.species;
  const modulesKey = pet ? pet.careModules.join() : '';

  // Re-resolve only when the inputs that decide the plan change.
  const plan = useMemo(
    () => (pet ? resolvePlan(pet) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [species, modulesKey],
  );

  const feedTimes = pet ? getFeedTimesForPet(pet.id) : [];
  const meds = pet ? getMedicationsForPet(pet.id) : [];
  const logs = pet ? getLogsForPet(pet.id) : NO_LOGS;

  return useMemo(() => {
    if (!pet || !plan) return null;
    const s = buildSnapshot({ pet, feedTimes, meds, logs, appts: appointments, now, timeZone });
    return {
      hero: heroFor(plan, s),
      upcoming: planUpcoming(plan, s),
      quickLog: planQuickLog(plan, s),
      status: petStatus(plan, s),
      plan: planView(plan),
    };
    // feedTimes/meds/logs are stable per-pet arrays from the contexts (D28).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet, plan, feedTimes, meds, logs, appointments, now, timeZone]);
}
