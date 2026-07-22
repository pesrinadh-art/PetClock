import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
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
  activePet: Pet;
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
  const [activePetId, setActivePetId] = useState(seedPets[0].id);
  const activePet = pets.find((p) => p.id === activePetId) ?? pets[0];

  const addPet = (pet: NewPet) => {
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
  };

  const removePet = (id: string) => {
    if (pets.length <= 1) return false;
    setPets((prev) => prev.filter((p) => p.id !== id));
    if (activePetId === id) {
      const fallback = pets.find((p) => p.id !== id);
      if (fallback) setActivePetId(fallback.id);
    }
    return true;
  };

  const updatePet = (id: string, edits: PetEdits) => {
    setPets((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ...edits, meta: [edits.breed, edits.age].filter(Boolean).join(' · ') }
          : p
      )
    );
  };

  const value = useMemo(
    () => ({ pets, activePet, activePetId, setActivePetId, addPet, removePet, updatePet }),
    [pets, activePet, activePetId]
  );

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets() {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error('usePets must be used within a PetsProvider');
  return ctx;
}
