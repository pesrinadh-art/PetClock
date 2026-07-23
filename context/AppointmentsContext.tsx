import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { appointments as seedAppointments, type Appointment, type ApptType } from '../data/mockData';

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
  addAppointment: (input: NewAppointment) => void;
  updateAppointment: (id: string, patch: AppointmentPatch) => void;
  removeAppointment: (id: string) => void;
  removePetFromAppointments: (petId: string) => void;
};

const AppointmentsContext = createContext<AppointmentsContextValue | null>(null);

function sortByDate(list: Appointment[]): Appointment[] {
  return [...list].sort((a, b) => a.dateTime - b.dateTime);
}

export function AppointmentsProvider({ children }: { children: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>(seedAppointments);

  const addAppointment = useCallback((input: NewAppointment) => {
    const appointment: Appointment = {
      id: `appt-${Date.now()}`,
      type: input.type,
      title: input.title,
      petIds: input.petIds,
      dateTime: input.dateTime,
      hasTime: input.hasTime,
      location: input.location,
      notes: input.notes,
      reminderOffsets: input.reminderOffsets ?? [],
    };
    setAppointments((prev) => sortByDate([...prev, appointment]));
  }, []);

  const updateAppointment = useCallback((id: string, patch: AppointmentPatch) => {
    setAppointments((prev) => sortByDate(prev.map((a) => (a.id === id ? { ...a, ...patch } : a))));
  }, []);

  const removeAppointment = useCallback((id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Pet-delete cascade (D10): detach the pet from every appointment; an appointment
  // that referenced only this pet has no subject left, so it is dropped entirely.
  const removePetFromAppointments = useCallback((petId: string) => {
    setAppointments((prev) =>
      prev
        .map((a) => (a.petIds.includes(petId) ? { ...a, petIds: a.petIds.filter((id) => id !== petId) } : a))
        .filter((a) => a.petIds.length > 0)
    );
  }, []);

  const value = useMemo(
    () => ({ appointments, addAppointment, updateAppointment, removeAppointment, removePetFromAppointments }),
    [appointments, addAppointment, updateAppointment, removeAppointment, removePetFromAppointments]
  );

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

export function useAppointments() {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error('useAppointments must be used within an AppointmentsProvider');
  return ctx;
}
