import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { type Appointment, type ApptType } from '../data/mockData';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import { newId } from '../lib/id';
import { repos } from '../lib/repo/types';

type NewAppointment = {
  type: ApptType;
  title: string;
  petIds: string[];
  dateTime: number;
  hasTime: boolean;
  location?: string;
  notes?: string;
  reminderOffsets?: number[];
};

type AppointmentPatch = Partial<Omit<Appointment, 'id'>>;

type AppointmentsContextValue = {
  appointments: Appointment[];
  /** True once the appointments collection has been read from storage (Wave-3 splash gate). */
  hydrated: boolean;
  addAppointment: (input: NewAppointment) => void;
  updateAppointment: (id: string, patch: AppointmentPatch) => void;
  removeAppointment: (id: string) => void;
  removePetFromAppointments: (petId: string) => void;
};

const AppointmentsContext = createContext<AppointmentsContextValue | null>(null);

export function AppointmentsProvider({ children }: { children: ReactNode }) {
  // Persisted, storage-backed state (see usePersistedCollection; Pets is the reference).
  // The repo keeps the collection sorted by dateTime on upsert, so no local sort is needed.
  const { items: appointments, hydrated } = usePersistedCollection(repos.appointments);

  const addAppointment = useCallback((input: NewAppointment) => {
    const appointment: Appointment = {
      // Client-generated uuid v4 (frozen contract) — the entity's stable id.
      id: newId(),
      type: input.type,
      title: input.title,
      petIds: input.petIds,
      dateTime: input.dateTime,
      hasTime: input.hasTime,
      location: input.location,
      notes: input.notes,
      reminderOffsets: input.reminderOffsets ?? [],
    };
    // Repo persists (sorted by dateTime) + notifies; usePersistedCollection re-pulls.
    void repos.appointments.upsert(appointment);
  }, []);

  const updateAppointment = useCallback(
    (id: string, patch: AppointmentPatch) => {
      const existing = appointments.find((a) => a.id === id);
      if (!existing) return;
      void repos.appointments.upsert({ ...existing, ...patch });
    },
    [appointments],
  );

  const removeAppointment = useCallback((id: string) => {
    void repos.appointments.remove(id);
  }, []);

  // Pet-delete cascade (D10): detach the pet from every appointment; an appointment
  // that referenced only this pet has no subject left, so it is dropped entirely. The
  // repo performs the detach/drop atomically and notifies.
  const removePetFromAppointments = useCallback((petId: string) => {
    void repos.appointments.removePetRef(petId);
  }, []);

  const value = useMemo(
    () => ({ appointments, hydrated, addAppointment, updateAppointment, removeAppointment, removePetFromAppointments }),
    [appointments, hydrated, addAppointment, updateAppointment, removeAppointment, removePetFromAppointments]
  );

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

export function useAppointments() {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error('useAppointments must be used within an AppointmentsProvider');
  return ctx;
}
