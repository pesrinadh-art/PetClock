import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { appointments as seedAppointments, type Appointment, type ApptType } from '../data/mockData';
import { computeCountdown, parseAppointmentDateTime } from '../lib/appointmentUtils';

type NewAppointment = {
  type: ApptType;
  title: string;
  petNames: string[];
  date: string;
  time?: string;
  location?: string;
  notes?: string;
  reminderEnabled?: boolean;
};

type AppointmentsContextValue = {
  appointments: Appointment[];
  addAppointment: (input: NewAppointment) => void;
  removeAppointment: (id: string) => void;
};

const AppointmentsContext = createContext<AppointmentsContextValue | null>(null);

function sortByDate(list: Appointment[]): Appointment[] {
  return [...list].sort((a, b) => {
    const aTime = parseAppointmentDateTime(a.date, a.time)?.getTime() ?? Infinity;
    const bTime = parseAppointmentDateTime(b.date, b.time)?.getTime() ?? Infinity;
    return aTime - bTime;
  });
}

export function AppointmentsProvider({ children }: { children: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>(seedAppointments);

  const addAppointment = (input: NewAppointment) => {
    const parsed = parseAppointmentDateTime(input.date, input.time);
    const countdown = parsed ? computeCountdown(parsed) : { label: input.date || 'Scheduled', kind: 'upcoming' as const };
    const appointment: Appointment = {
      id: `appt-${Date.now()}`,
      type: input.type,
      title: input.title,
      petNames: input.petNames,
      date: input.date,
      time: input.time,
      location: input.location,
      notes: input.notes,
      countdown,
      reminderEnabled: input.reminderEnabled,
    };
    setAppointments((prev) => sortByDate([...prev, appointment]));
  };

  const removeAppointment = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  const value = useMemo(() => ({ appointments, addAppointment, removeAppointment }), [appointments]);

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

export function useAppointments() {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error('useAppointments must be used within an AppointmentsProvider');
  return ctx;
}
