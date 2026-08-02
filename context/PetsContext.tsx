import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { type FeedTime, type Medication, type Pet, type Species } from '../data/mockData';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import { newId } from '../lib/id';
import { LOCAL_HOUSEHOLD_ID } from '../lib/localHousehold';
import { repos } from '../lib/repo/types';

/** Primitive medication input from forms — the context mints id/petId/active. */
type MedicationInput = { name: string; localTime: string; dosage?: string | null };

type ScheduleFields = {
  /** Feed-time wall clocks, "HH:MM" 24h. Stored as their own FeedTime collection. */
  feedTimes: string[];
  peeHoldHours: number | null;
  poopHoldHours: number | null;
  medications: MedicationInput[];
};

type NewPet = {
  name: string;
  avatarEmoji: string;
  breed: string;
  species?: Species;
} & Partial<ScheduleFields>;

type PetEdits = {
  name: string;
  avatarEmoji: string;
  breed: string;
} & ScheduleFields;

type PetsContextValue = {
  pets: Pet[];
  /** True once pets, feed times and medications have all been read from storage (splash gate). */
  hydrated: boolean;
  activePet: Pet | null;
  activePetId: string;
  setActivePetId: (id: string) => void;
  addPet: (pet: NewPet) => void;
  removePet: (id: string) => boolean;
  updatePet: (id: string, edits: PetEdits) => void;
  /** Feed times for a pet (its own collection now). Stable arrays between changes. */
  getFeedTimesForPet: (petId: string) => FeedTime[];
  /** Medications for a pet (its own collection now). Stable arrays between changes. */
  getMedicationsForPet: (petId: string) => Medication[];
};

const PetsContext = createContext<PetsContextValue | null>(null);

const EMPTY_FEED_TIMES: FeedTime[] = [];
const EMPTY_MEDICATIONS: Medication[] = [];

function buildFeedRows(petId: string, times: string[]): FeedTime[] {
  return times.map((localTime) => ({ id: newId(), petId, localTime, label: null, active: true }));
}

function buildMedRows(petId: string, meds: MedicationInput[]): Medication[] {
  return meds.map((m) => ({
    id: newId(),
    petId,
    name: m.name,
    dosage: m.dosage ?? null,
    localTime: m.localTime,
    active: true,
  }));
}

export function PetsProvider({ children }: { children: ReactNode }) {
  // Persisted, storage-backed state (reference integration — see usePersistedCollection).
  const { items: pets, hydrated: petsHydrated } = usePersistedCollection(repos.pets);
  const { items: feedTimes, hydrated: feedTimesHydrated } = usePersistedCollection(repos.feedTimes);
  const { items: medications, hydrated: medsHydrated } = usePersistedCollection(repos.medications);
  const hydrated = petsHydrated && feedTimesHydrated && medsHydrated;
  // Selection is in-memory only, never persisted: it's shared across every screen with a
  // pet switcher, so picking Luna on Home keeps her selected when you jump to Food.
  const [selectedPetId, setSelectedPetId] = useState('');
  // Derived, never repointed imperatively: if the selected pet was just deleted we fall
  // back to the first pet, and with no pets at all it's null so screens can render an
  // empty state instead of crashing (D27).
  const activePet = pets.find((p) => p.id === selectedPetId) ?? pets[0] ?? null;
  const activePetId = activePet?.id ?? '';

  // Memoized per-pet indexes so the getters return stable arrays between changes (D28).
  const feedTimesByPet = useMemo(() => {
    const byPet = new Map<string, FeedTime[]>();
    for (const ft of feedTimes) {
      const list = byPet.get(ft.petId);
      if (list) list.push(ft);
      else byPet.set(ft.petId, [ft]);
    }
    return byPet;
  }, [feedTimes]);

  const medicationsByPet = useMemo(() => {
    const byPet = new Map<string, Medication[]>();
    for (const med of medications) {
      const list = byPet.get(med.petId);
      if (list) list.push(med);
      else byPet.set(med.petId, [med]);
    }
    return byPet;
  }, [medications]);

  const getFeedTimesForPet = useCallback(
    (petId: string) => feedTimesByPet.get(petId) ?? EMPTY_FEED_TIMES,
    [feedTimesByPet],
  );
  const getMedicationsForPet = useCallback(
    (petId: string) => medicationsByPet.get(petId) ?? EMPTY_MEDICATIONS,
    [medicationsByPet],
  );

  const addPet = useCallback((pet: NewPet) => {
    // Client-generated uuid v4 (frozen contract) — the entity's stable id.
    const id = newId();
    const nowIso = new Date().toISOString();
    // Repo persists + notifies; usePersistedCollection re-pulls and updates state.
    // TODO(post-SYNC-1): species + birthdate pickers — add-pet defaults species to 'other'
    // and birthdate to null (the free-text age field is dropped this wave).
    void repos.pets.upsert({
      id,
      householdId: LOCAL_HOUSEHOLD_ID,
      name: pet.name,
      avatarEmoji: pet.avatarEmoji,
      species: pet.species ?? 'other',
      breed: pet.breed || null,
      birthdate: null,
      weightKg: null,
      peeHoldHours: pet.peeHoldHours ?? null,
      poopHoldHours: pet.poopHoldHours ?? null,
      calibrationStartedAt: nowIso,
      archivedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    // Feed times and medications are separate collections keyed by petId.
    void repos.pets.replaceFeedTimes(id, buildFeedRows(id, pet.feedTimes ?? []));
    void repos.pets.replaceMedications(id, buildMedRows(id, pet.medications ?? []));
  }, []);

  const removePet = useCallback(
    (id: string): boolean => {
      // Last-pet guard + existence check for the boolean the caller acts on. The
      // authoritative, race-safe guard for the cascade path lives in the repo
      // (deleteCascade) so two rapid deletes can never drop the final pet (D12).
      if (pets.length <= 1 || !pets.some((p) => p.id === id)) return false;
      void repos.pets.remove(id);
      // No active-pet repointing needed: activePet is derived with a first-pet fallback.
      return true;
    },
    [pets],
  );

  const updatePet = useCallback(
    (id: string, edits: PetEdits) => {
      const existing = pets.find((p) => p.id === id);
      if (!existing) return;
      void repos.pets.upsert({
        ...existing,
        name: edits.name,
        avatarEmoji: edits.avatarEmoji,
        breed: edits.breed || null,
        peeHoldHours: edits.peeHoldHours,
        poopHoldHours: edits.poopHoldHours,
        updatedAt: new Date().toISOString(),
      });
      // Replacing the whole slot list mints fresh ids; a food log referencing an old feed-time
      // falls back to the earliest-uncovered slot (Δ1 pass 2), so the done count is preserved.
      void repos.pets.replaceFeedTimes(id, buildFeedRows(id, edits.feedTimes));
      void repos.pets.replaceMedications(id, buildMedRows(id, edits.medications));
    },
    [pets],
  );

  const value = useMemo(
    () => ({
      pets,
      hydrated,
      activePet,
      activePetId,
      setActivePetId: setSelectedPetId,
      addPet,
      removePet,
      updatePet,
      getFeedTimesForPet,
      getMedicationsForPet,
    }),
    [pets, hydrated, activePet, activePetId, addPet, removePet, updatePet, getFeedTimesForPet, getMedicationsForPet]
  );

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets() {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error('usePets must be used within a PetsProvider');
  return ctx;
}
