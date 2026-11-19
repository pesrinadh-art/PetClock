/**
 * Test-only fixture builders for the Phase 0 characterization suites.
 *
 * Every fixture goes through these builders so a later phase that widens a model (e.g. Phase 1
 * adding `Pet.careModules`) updates ONE default here instead of every literal in every test.
 * Nothing here reads the real clock: all instants are built from explicit ISO strings.
 */
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../../db/models';

export const TEST_HOUSEHOLD_ID = '00000000-0000-4000-8000-0000000000aa';

/** A local wall-clock instant in the test process TZ (pinned to America/Chicago in jest.config.js). */
export function localAt(y: number, mo: number, d: number, h: number, mi = 0): Date {
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function mkPet(p: Partial<Pet> & Pick<Pet, 'id' | 'name'>): Pet {
  return {
    householdId: TEST_HOUSEHOLD_ID,
    avatarEmoji: '🐶',
    species: 'dog',
    breed: null,
    birthdate: null,
    weightKg: null,
    peeHoldHours: null,
    poopHoldHours: null,
    calibrationStartedAt: '2026-06-01T12:00:00.000Z',
    // Every pet that predates care modules (and the 0019 backfill): today's behaviour.
    careModules: ['potty', 'meals', 'meds', 'visits'],
    archivedAt: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    ...p,
  };
}

export function mkFeed(id: string, petId: string, localTime: string, active = true): FeedTime {
  return { id, petId, localTime, label: null, active };
}

export function mkMed(
  id: string,
  petId: string,
  name: string,
  localTime: string,
  dosage: string | null = null,
  active = true,
): Medication {
  return { id, petId, name, dosage, localTime, active };
}

export function mkLog(
  id: string,
  petId: string,
  type: LogEntry['type'],
  occurredAt: Date | string,
  extra: Partial<LogEntry> = {},
): LogEntry {
  const iso = typeof occurredAt === 'string' ? occurredAt : occurredAt.toISOString();
  return {
    id,
    householdId: TEST_HOUSEHOLD_ID,
    petId,
    type,
    occurredAt: iso,
    note: null,
    source: 'manual',
    feedTimeId: null,
    medicationId: null,
    notificationId: null,
    createdBy: null,
    createdAt: iso,
    deletedAt: null,
    ...extra,
  };
}

export function mkAppt(a: Partial<Appointment> & Pick<Appointment, 'id' | 'title' | 'startsAt'>): Appointment {
  return {
    householdId: TEST_HOUSEHOLD_ID,
    type: 'vet',
    petIds: [],
    allDay: false,
    location: null,
    notes: null,
    completedAt: null,
    reminderOffsetsMinutes: [],
    deletedAt: null,
    ...a,
  };
}
