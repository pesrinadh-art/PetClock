import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { pets as seedPets, type Medication, type Pet } from '../data/mockData';

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
  activePet: Pet | null;
  activePetId: string;
  setActivePetId: (id: string) => void;
  addPet: (pet: NewPet) => void;
  removePet: (id: string) => boolean;
  updatePet: (id: string, edits: PetEdits) => void;
};

const PetsContext = createContext<PetsContextValue | null>(null);

export function PetsProvider({ children }: { children: ReactNode }) {
  const [pets, setPets] = useState<Pet[]>(seedPets);
  // Shared across every screen with a pet switcher, so picking Luna on Home keeps her
  // selected when you jump to Food instead of each screen tracking its own local pet.
  const [selectedPetId, setSelectedPetId] = useState(seedPets[0]?.id ?? '');
  // Derived, never repointed imperatively: if the selected pet was just deleted we fall
  // back to the first pet, and with no pets at all it's null so screens can render an
  // empty state instead of crashing (D27).
  const activePet = pets.find((p) => p.id === selectedPetId) ?? pets[0] ?? null;
  const activePetId = activePet?.id ?? '';

  const addPet = useCallback((pet: NewPet) => {
    const id = `${pet.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const meta = pet.meta ?? [pet.breed, pet.age].filter(Boolean).join(' · ');
    setPets((prev) => [
      ...prev,
      {
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
      },
    ]);
  }, []);

  const removePet = useCallback((id: string) => {
    let removed = false;
    setPets((prev) => {
      // Check against prev, not the render-scoped pets array — two rapid deletes would
      // otherwise both see the same stale list and race past the last-pet guard (D12).
      if (prev.length <= 1) return prev;
      const next = prev.filter((p) => p.id !== id);
      if (next.length === prev.length) return prev;
      removed = true;
      return next;
    });
    // No active-pet repointing needed: activePet is derived with a first-pet fallback.
    return removed;
  }, []);

  const updatePet = useCallback((id: string, edits: PetEdits) => {
    setPets((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ...edits, meta: [edits.breed, edits.age].filter(Boolean).join(' · ') }
          : p
      )
    );
  }, []);

  const value = useMemo(
    () => ({
      pets,
      activePet,
      activePetId,
      setActivePetId: setSelectedPetId,
      addPet,
      removePet,
      updatePet,
    }),
    [pets, activePet, activePetId, addPet, removePet, updatePet]
  );

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets() {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error('usePets must be used within a PetsProvider');
  return ctx;
}
