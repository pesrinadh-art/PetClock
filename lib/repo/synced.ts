import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import {
  toAppointment,
  toFeedTime,
  toLogEntry,
  toMedication,
  toPet,
} from '../db/models';
import type { Database, Json } from '../db/types.gen';
import { newId } from '../id';
import type { EntityRepo, NewLogInput, PawclockRepos } from './types';

/**
 * SYNC-1 synced repository — the Supabase-backed twin of `createLocalRepos()`.
 *
 * Same {@link PawclockRepos} contract, so the facade can hot-swap it in with no context
 * changes. Reads are scoped by `household_id` and filter tombstones; writes go through the
 * table (where RLS allows an editor to write directly) or the atomic RPCs in
 * `0007_rpcs.sql` (feed times, medications, appointments).
 *
 * `subscribe` is a LOCAL in-process emitter (mirrors `local.ts`): after each successful
 * mutation we `notify()` and every mounted `usePersistedCollection` re-pulls. Coarse
 * cross-device refresh rides on the hook's AppState-foreground re-pull.
 *
 * TODO(SYNC 2): swap the local emitter for `supabase.channel(...).on('postgres_changes', …)`
 * so a second caregiver's write pushes to this device in real time (BE-2).
 */

type Client = SupabaseClient<Database>;
type Row = Record<string, any>;

type PetInsert = Database['public']['Tables']['pets']['Insert'];
type LogInsert = Database['public']['Tables']['logs']['Insert'];
type FeedTimeInsert = Database['public']['Tables']['feed_times']['Insert'];
type MedicationInsert = Database['public']['Tables']['medications']['Insert'];

/** Tiny synchronous fan-out — the synced mirror of local.ts's listener set. */
class Emitter {
  private readonly listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  notify = (): void => {
    for (const l of this.listeners) l();
  };
}

const nowIso = (): string => new Date().toISOString();

// ---------------------------------------------------------------------------
// camelCase model → snake_case row (the inverse of the models.ts toX mappers)
// ---------------------------------------------------------------------------

function petToInsert(p: Pet): PetInsert {
  return {
    id: p.id,
    household_id: p.householdId,
    name: p.name,
    avatar_emoji: p.avatarEmoji,
    species: p.species,
    breed: p.breed,
    birthdate: p.birthdate,
    weight_kg: p.weightKg,
    pee_hold_hours: p.peeHoldHours,
    poop_hold_hours: p.poopHoldHours,
    calibration_started_at: p.calibrationStartedAt,
    archived_at: p.archivedAt,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function feedTimeToInsert(f: FeedTime): FeedTimeInsert {
  return { id: f.id, pet_id: f.petId, local_time: f.localTime, label: f.label, active: f.active };
}

function medicationToInsert(m: Medication): MedicationInsert {
  return {
    id: m.id,
    pet_id: m.petId,
    name: m.name,
    dosage: m.dosage,
    local_time: m.localTime,
    active: m.active,
  };
}

// ---------------------------------------------------------------------------

export function createSyncedRepos(
  client: Client,
  householdId: string,
  userId: string,
): PawclockRepos {
  const petsEmitter = new Emitter();
  const feedTimesEmitter = new Emitter();
  const medicationsEmitter = new Emitter();
  const logsEmitter = new Emitter();
  const appointmentsEmitter = new Emitter();

  const fail = (error: { message: string } | null): void => {
    if (error) throw new Error(error.message);
  };

  // ---- reads ----
  const listPets = async (): Promise<Pet[]> => {
    const { data, error } = await client
      .from('pets')
      .select('*')
      .eq('household_id', householdId)
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    fail(error);
    return ((data ?? []) as Row[]).map(toPet);
  };

  // feed_times / medications carry no household_id — scope them through their pet, and
  // hide slots of archived pets so a soft-deleted pet leaves no orphan rows in the UI.
  const listFeedTimes = async (): Promise<FeedTime[]> => {
    const { data, error } = await client
      .from('feed_times')
      .select('id, pet_id, local_time, label, active, pets!inner(household_id, archived_at)')
      .eq('pets.household_id', householdId)
      .is('pets.archived_at', null)
      .eq('active', true)
      .order('local_time', { ascending: true });
    fail(error);
    return ((data ?? []) as Row[]).map(toFeedTime);
  };

  const listMedications = async (): Promise<Medication[]> => {
    const { data, error } = await client
      .from('medications')
      .select('id, pet_id, name, dosage, local_time, active, pets!inner(household_id, archived_at)')
      .eq('pets.household_id', householdId)
      .is('pets.archived_at', null)
      .eq('active', true)
      .order('local_time', { ascending: true });
    fail(error);
    return ((data ?? []) as Row[]).map(toMedication);
  };

  const listLogs = async (): Promise<LogEntry[]> => {
    const { data, error } = await client
      .from('logs')
      .select('*')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false });
    fail(error);
    return ((data ?? []) as Row[]).map(toLogEntry);
  };

  const listAppointments = async (): Promise<Appointment[]> => {
    const { data, error } = await client
      .from('appointments')
      .select('*, appointment_pets(pet_id), appointment_reminders(offset_minutes)')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('starts_at', { ascending: true });
    fail(error);
    return ((data ?? []) as Row[]).map((r) =>
      toAppointment(
        r,
        (r.appointment_pets ?? []).map((p: Row) => p.pet_id),
        (r.appointment_reminders ?? []).map((x: Row) => x.offset_minutes),
      ),
    );
  };

  // ---- pets writes ----
  const upsertPet = async (pet: Pet): Promise<Pet> => {
    const { error } = await client.from('pets').upsert(petToInsert(pet));
    fail(error);
    petsEmitter.notify();
    return pet;
  };

  // remove = soft delete (archive). Log history survives the pet (schema comment).
  const removePet = async (id: string): Promise<void> => {
    const { error } = await client
      .from('pets')
      .update({ archived_at: nowIso() })
      .eq('id', id)
      .eq('household_id', householdId);
    fail(error);
    petsEmitter.notify();
  };

  // Detach a pet from every appointment: drop the ones left with no pets, keep the rest.
  const detachPetFromAppointments = async (petId: string): Promise<void> => {
    const appts = await listAppointments();
    const affected = appts.filter((a) => a.petIds.includes(petId));
    for (const a of affected) {
      if (a.petIds.length <= 1) {
        // Only subject was this pet → soft-delete the appointment.
        const { error } = await client
          .from('appointments')
          .update({ deleted_at: nowIso() })
          .eq('id', a.id);
        fail(error);
      }
    }
    // Remove the join rows for the pet across all (surviving) appointments.
    const { error } = await client.from('appointment_pets').delete().eq('pet_id', petId);
    fail(error);
  };

  const deleteCascade = async (petId: string): Promise<void> => {
    // Authoritative, race-safe last-pet guard (mirrors local.ts): never delete the final
    // pet, and no-op if it is already gone.
    const pets = await listPets();
    if (pets.length <= 1 || !pets.some((p) => p.id === petId)) return;

    // Soft-delete the pet's logs (tombstones), then archive the pet, then detach appts.
    fail(
      (
        await client
          .from('logs')
          .update({ deleted_at: nowIso() })
          .eq('pet_id', petId)
          .is('deleted_at', null)
      ).error,
    );
    await detachPetFromAppointments(petId);
    await removePet(petId); // archives pet + notifies pets

    logsEmitter.notify();
    feedTimesEmitter.notify();
    medicationsEmitter.notify();
    appointmentsEmitter.notify();
  };

  const replaceFeedTimes = async (petId: string, feedTimes: FeedTime[]): Promise<void> => {
    // RPC atomically retires slots not in the list and (re)activates the rest. It keys on
    // `local_time`, so slot ids are server-owned here (labels are derived, not sent).
    const { error } = await client.rpc('replace_feed_times', {
      p_pet_id: petId,
      p_times: feedTimes.map((f) => f.localTime),
    });
    fail(error);
    feedTimesEmitter.notify();
  };

  const replaceMedications = async (petId: string, meds: Medication[]): Promise<void> => {
    const payload = meds.map((m) => ({
      id: m.id,
      name: m.name,
      dosage: m.dosage,
      localTime: m.localTime,
    }));
    const { error } = await client.rpc('replace_medications', {
      p_pet_id: petId,
      p_meds: payload as unknown as Json,
    });
    fail(error);
    medicationsEmitter.notify();
  };

  // ---- feed_times / medications as their own collections (direct writes; RLS: editor) ----
  const upsertFeedTime = async (item: FeedTime): Promise<FeedTime> => {
    const { error } = await client.from('feed_times').upsert(feedTimeToInsert(item));
    fail(error);
    feedTimesEmitter.notify();
    return item;
  };
  const removeFeedTime = async (id: string): Promise<void> => {
    const { error } = await client.from('feed_times').update({ active: false }).eq('id', id);
    fail(error);
    feedTimesEmitter.notify();
  };

  const upsertMedication = async (item: Medication): Promise<Medication> => {
    const { error } = await client.from('medications').upsert(medicationToInsert(item));
    fail(error);
    medicationsEmitter.notify();
    return item;
  };
  const removeMedication = async (id: string): Promise<void> => {
    const { error } = await client.from('medications').update({ active: false }).eq('id', id);
    fail(error);
    medicationsEmitter.notify();
  };

  // ---- logs ----
  const addLog = async (petId: string, input: NewLogInput): Promise<LogEntry> => {
    const occurredAt = input.occurredAt ?? nowIso();
    const createdAt = nowIso();
    const entry: LogEntry = {
      id: newId(), // client uuid v4 = offline idempotency key (frozen contract)
      householdId,
      petId,
      type: input.type,
      occurredAt,
      note: input.note ?? null,
      // Honor the caller's provenance/push linkage (mirrors local.ts) — a headless
      // notification "Yes" passes source 'notification_yes' and the originating push id;
      // hardcoding 'manual'/null here would silently drop both in synced mode.
      source: input.source ?? 'manual',
      feedTimeId: input.feedTimeId ?? null,
      medicationId: input.medicationId ?? null,
      notificationId: input.notificationId ?? null,
      createdBy: userId, // logs_insert WITH CHECK requires created_by = auth.uid()
      createdAt,
      deletedAt: null,
    };
    const insert: LogInsert = {
      id: entry.id,
      household_id: entry.householdId,
      pet_id: entry.petId,
      type: entry.type,
      occurred_at: entry.occurredAt,
      note: entry.note,
      source: entry.source,
      feed_time_id: entry.feedTimeId,
      medication_id: entry.medicationId,
      notification_id: entry.notificationId,
      created_by: entry.createdBy,
      created_at: entry.createdAt,
    };
    // Idempotent: a retry of the same tap re-sends the same PK and no-ops (gate 2).
    const { error } = await client
      .from('logs')
      .upsert(insert, { onConflict: 'id', ignoreDuplicates: true });
    fail(error);
    logsEmitter.notify();
    return entry;
  };

  const upsertLog = async (item: LogEntry): Promise<LogEntry> => {
    // Note edits / undo (soft-delete) only — logs are otherwise immutable facts.
    const { error } = await client
      .from('logs')
      .update({ note: item.note, deleted_at: item.deletedAt })
      .eq('id', item.id);
    fail(error);
    logsEmitter.notify();
    return item;
  };

  const removeLog = async (id: string): Promise<void> => {
    const { error } = await client.from('logs').update({ deleted_at: nowIso() }).eq('id', id);
    fail(error);
    logsEmitter.notify();
  };

  const removeLogsForPet = async (petId: string): Promise<void> => {
    const { error } = await client
      .from('logs')
      .update({ deleted_at: nowIso() })
      .eq('pet_id', petId)
      .is('deleted_at', null);
    fail(error);
    logsEmitter.notify();
  };

  // ---- appointments ----
  const upsertAppointment = async (item: Appointment): Promise<Appointment> => {
    // One atomic write across appointments + appointment_pets + appointment_reminders.
    // `item.allDay` already carries DB `all_day` semantics (the hasTime⇄allDay flip lives
    // at the add-appointment form seam, not here), so it is passed straight through.
    const { error } = await client.rpc('create_appointment', {
      p_id: item.id,
      p_household_id: householdId,
      p_type: item.type,
      p_title: item.title,
      p_starts_at: item.startsAt,
      p_all_day: item.allDay,
      p_location: item.location ?? undefined,
      p_notes: item.notes ?? undefined,
      p_pet_ids: item.petIds,
      p_reminder_offsets: item.reminderOffsetsMinutes,
    });
    fail(error);
    // create_appointment does not touch completed_at; sync mark-complete edits directly.
    const { error: cErr } = await client
      .from('appointments')
      .update({ completed_at: item.completedAt })
      .eq('id', item.id);
    fail(cErr);
    appointmentsEmitter.notify();
    return item;
  };

  const removeAppointment = async (id: string): Promise<void> => {
    const { error } = await client
      .from('appointments')
      .update({ deleted_at: nowIso() })
      .eq('id', id);
    fail(error);
    appointmentsEmitter.notify();
  };

  const removePetRef = async (petId: string): Promise<void> => {
    await detachPetFromAppointments(petId);
    appointmentsEmitter.notify();
  };

  // ---- demo / reset affordances ----
  // No server demo data exists; keep these safe no-ops in synced mode. resetAll soft-deletes
  // this household's live rows so the Settings "reset" affordance still clears the UI.
  const loadDemoData = async (): Promise<void> => {
    // Intentionally a no-op in synced mode (demo seeding is a local-only affordance).
  };

  const resetAll = async (): Promise<void> => {
    const ts = nowIso();
    fail((await client.from('logs').update({ deleted_at: ts }).eq('household_id', householdId).is('deleted_at', null)).error);
    fail((await client.from('appointments').update({ deleted_at: ts }).eq('household_id', householdId).is('deleted_at', null)).error);
    fail((await client.from('pets').update({ archived_at: ts }).eq('household_id', householdId).is('archived_at', null)).error);
    petsEmitter.notify();
    feedTimesEmitter.notify();
    medicationsEmitter.notify();
    logsEmitter.notify();
    appointmentsEmitter.notify();
  };

  const petsRepo: EntityRepo<Pet> & {
    deleteCascade(petId: string): Promise<void>;
    replaceFeedTimes(petId: string, feedTimes: FeedTime[]): Promise<void>;
    replaceMedications(petId: string, medications: Medication[]): Promise<void>;
  } = {
    list: listPets,
    upsert: upsertPet,
    remove: removePet,
    subscribe: petsEmitter.subscribe,
    deleteCascade,
    replaceFeedTimes,
    replaceMedications,
  };

  return {
    pets: petsRepo,
    feedTimes: {
      list: listFeedTimes,
      upsert: upsertFeedTime,
      remove: removeFeedTime,
      subscribe: feedTimesEmitter.subscribe,
    },
    medications: {
      list: listMedications,
      upsert: upsertMedication,
      remove: removeMedication,
      subscribe: medicationsEmitter.subscribe,
    },
    logs: {
      list: listLogs,
      upsert: upsertLog,
      remove: removeLog,
      subscribe: logsEmitter.subscribe,
      add: addLog,
      removeForPet: removeLogsForPet,
    },
    appointments: {
      list: listAppointments,
      upsert: upsertAppointment,
      remove: removeAppointment,
      subscribe: appointmentsEmitter.subscribe,
      removePetRef,
    },
    loadDemoData,
    resetAll,
  };
}
