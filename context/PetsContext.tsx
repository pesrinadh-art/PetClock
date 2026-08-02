import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { type Medication, type Pet } from '../data/mockData';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import { repos } from '../lib/repo/types';

type ScheduleFields = {
  feedTimes: string[];
  peeHoldHours: number | null;
  poopHoldHours: number | null;
  medications: Medication[];
};

type NewPet = {
  name: string;
  avatar: string;
  breed: string;
  age: string;
} & Partial<ScheduleFields> & {
    meta?: string;
  };

type PetEdits = {
  name: string;
  avatar: string;
  breed: string;
  age: string;
} & ScheduleFields;

type PetsContextValue = {
  pets: Pet[];
  /** True once the pets collection has been read from storage (Wave-3 splash gate). */
  hydrated: boolean;
  activePet: Pet | null;
  activePetId: string;
  setActivePetId: (id: string) => void;
  addPet: (pet: NewPet) => void;
  removePet: (id: string) => boolean;
  updatePet: (id: string, edits: PetEdits) => void;
};

const PetsContext = createContext<PetsContextValue | null>(null);

export function PetsProvider({ children }: { children: ReactNode }) {
  // Persisted, storage-backed state (reference integration — see usePersistedCollection).
  const { items: pets, hydrated } = usePersistedCollection(repos.pets);
  // Selection is in-memory only, never persisted: it's shared across every screen with a
  // pet switcher, so picking Luna on Home keeps her selected when you jump to Food.
  const [selectedPetId, setSelectedPetId] = useState('');
  // Derived, never repointed imperatively: if the selected pet was just deleted we fall
  // back to the first pet, and with no pets at all it's null so screens can render an
  // empty state instead of crashing (D27).
  const activePet = pets.find((p) => p.id === selectedPetId) ?? pets[0] ?? null;
  const activePetId = activePet?.id ?? '';

  const addPet = useCallback((pet: NewPet) => {
    const id = `${pet.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const meta = pet.meta ?? [pet.breed, pet.age].filter(Boolean).join(' · ');
    // Repo persists + notifies; usePersistedCollection re-pulls and updates state.
    void repos.pets.upsert({
      id,
      name: pet.name,
      avatar: pet.avatar,
      breed: pet.breed,
      age: pet.age,
      meta,
      feedTimes: pet.feedTimes ?? [],
      peeHoldHours: pet.peeHoldHours ?? null,
      poopHoldHours: pet.poopHoldHours ?? null,
      medications: pet.medications ?? [],
      createdAt: Date.now(),
    });
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
        ...edits,
        meta: [edits.breed, edits.age].filter(Boolean).join(' · '),
      });
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
    }),
    [pets, hydrated, activePet, activePetId, addPet, removePet, updatePet]
  );

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets() {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error('usePets must be used within a PetsProvider');
  return ctx;
}
