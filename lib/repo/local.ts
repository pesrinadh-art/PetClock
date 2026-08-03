import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  appointments as demoAppointments,
  feedTimes as demoFeedTimes,
  medications as demoMedications,
  pets as demoPets,
  timeline as demoTimeline,
} from '../../data/mockData';
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import { newId } from '../id';
import { LOCAL_HOUSEHOLD_ID } from '../localHousehold';
import type { EntityRepo, NewLogInput, PawclockRepos } from './types';

// Each collection lives under its own key so a mutation to one never rewrites the
// others; `seeded` is the first-run flag that keeps a fresh install EMPTY.
const KEY_PETS = 'pawclock:pets';
const KEY_FEED_TIMES = 'pawclock:feedTimes';
const KEY_MEDICATIONS = 'pawclock:medications';
const KEY_LOGS = 'pawclock:logs';
const KEY_APPOINTMENTS = 'pawclock:appointments';
const KEY_SEEDED = 'pawclock:seeded';

type Listener = () => void;

/**
 * In-memory cache with write-through persistence. `list()` returns the cache
 * (hydrated from storage on first access); every mutation replaces the cache with
 * a fresh array (so React sees a new reference), persists it, and notifies
 * subscribers — including subscribers reacting to headless writes (FE-3).
 *
 * Public methods are bound class fields so they can be handed off by reference
 * (e.g. spread onto the repo object) without losing `this`.
 */
class LocalCollection<T extends { id: string }> {
  private cache: T[] = [];
  private hydrated = false;
  private hydrating: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storageKey: string,
    private readonly ensureSeeded: () => Promise<void>,
    private readonly sort?: (a: T, b: T) => number,
  ) {}

  private applySort(list: T[]): T[] {
    return this.sort ? [...list].sort(this.sort) : list;
  }

  private hydrate(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (!this.hydrating) {
      this.hydrating = (async () => {
        await this.ensureSeeded();
        const raw = await AsyncStorage.getItem(this.storageKey);
        const parsed = raw ? (JSON.parse(raw) as T[]) : [];
        this.cache = this.applySort(parsed);
        this.hydrated = true;
      })();
    }
    return this.hydrating;
  }

  private persist(): Promise<void> {
    return AsyncStorage.setItem(this.storageKey, JSON.stringify(this.cache));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Read the live cache synchronously — callers must have awaited `list()` first. */
  peek(): T[] {
    return this.cache;
  }

  /** Hydrate, apply `producer`, re-sort, persist, and notify — the one write path. */
  async mutate(producer: (cache: T[]) => T[]): Promise<void> {
    await this.hydrate();
    this.cache = this.applySort(producer(this.cache));
    await this.persist();
    this.notify();
  }

  /** Replace the whole collection (used by loadDemoData / resetAll). Marks hydrated. */
  async replaceAll(items: T[]): Promise<void> {
    this.cache = this.applySort(items);
    this.hydrated = true;
    await this.persist();
    this.notify();
  }

  list = async (): Promise<T[]> => {
    await this.hydrate();
    return this.cache;
  };

  upsert = async (item: T): Promise<T> => {
    const exists = this.peekHas(item.id);
    await this.mutate((cache) =>
      exists ? cache.map((x) => (x.id === item.id ? item : x)) : [...cache, item],
    );
    return item;
  };

  remove = async (id: string): Promise<void> => {
    await this.mutate((cache) => cache.filter((x) => x.id !== id));
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private peekHas(id: string): boolean {
    return this.cache.some((x) => x.id === id);
  }
}

function detachPet(list: Appointment[], petId: string): Appointment[] {
  // Detach the pet from every appointment; one referencing only this pet has no
  // subject left, so it is dropped entirely (D10).
  return list
    .map((a) => (a.petIds.includes(petId) ? { ...a, petIds: a.petIds.filter((id) => id !== petId) } : a))
    .filter((a) => a.petIds.length > 0);
}

export function createLocalRepos(): PawclockRepos {
  // First-run policy: a fresh install starts EMPTY (no demo pets). Runs once,
  // gated on the `seeded` flag, before any collection reads its key.
  let seededPromise: Promise<void> | null = null;
  const ensureSeeded = (): Promise<void> => {
    if (!seededPromise) {
      seededPromise = (async () => {
        const flag = await AsyncStorage.getItem(KEY_SEEDED);
        if (!flag) {
          await AsyncStorage.multiSet([
            [KEY_PETS, '[]'],
            [KEY_FEED_TIMES, '[]'],
            [KEY_MEDICATIONS, '[]'],
            [KEY_LOGS, '[]'],
            [KEY_APPOINTMENTS, '[]'],
            [KEY_SEEDED, '1'],
          ]);
        }
      })();
    }
    return seededPromise;
  };

  const petsCol = new LocalCollection<Pet>(KEY_PETS, ensureSeeded);
  const feedTimesCol = new LocalCollection<FeedTime>(KEY_FEED_TIMES, ensureSeeded);
  const medicationsCol = new LocalCollection<Medication>(KEY_MEDICATIONS, ensureSeeded);
  const logsCol = new LocalCollection<LogEntry>(KEY_LOGS, ensureSeeded);
  const apptsCol = new LocalCollection<Appointment>(
    KEY_APPOINTMENTS,
    ensureSeeded,
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  // ---- pets.deleteCascade (D10) — replaces the old hook-level cascade ----
  const deleteCascade = async (petId: string): Promise<void> => {
    // Ensure all caches are hydrated before we read/guard against them.
    await Promise.all([
      petsCol.list(),
      feedTimesCol.list(),
      medicationsCol.list(),
      logsCol.list(),
      apptsCol.list(),
    ]);
    // Authoritative, race-safe last-pet guard: never delete the final pet, and
    // no-op if the pet is already gone (two rapid deletes can't both pass).
    const pets = petsCol.peek();
    if (pets.length <= 1 || !pets.some((p) => p.id === petId)) return;
    await petsCol.mutate((cache) => cache.filter((p) => p.id !== petId));
    await feedTimesCol.mutate((cache) => cache.filter((f) => f.petId !== petId));
    await medicationsCol.mutate((cache) => cache.filter((m) => m.petId !== petId));
    await logsCol.mutate((cache) => cache.filter((l) => l.petId !== petId));
    await apptsCol.mutate((cache) => detachPet(cache, petId));
  };

  // ---- pets feed-time / medication collection replacers ----
  const replaceFeedTimes = async (petId: string, feedTimes: FeedTime[]): Promise<void> => {
    await feedTimesCol.mutate((cache) => [...cache.filter((f) => f.petId !== petId), ...feedTimes]);
  };
  const replaceMedications = async (petId: string, medications: Medication[]): Promise<void> => {
    await medicationsCol.mutate((cache) => [...cache.filter((m) => m.petId !== petId), ...medications]);
  };

  // ---- logs extras ----
  const addLog = async (petId: string, input: NewLogInput): Promise<LogEntry> => {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const entry: LogEntry = {
      // The id doubles as the offline idempotency key; minted once here as a
      // client-generated uuid v4 (frozen contract — CLAUDE.md).
      id: newId(),
      householdId: LOCAL_HOUSEHOLD_ID,
      petId,
      type: input.type,
      occurredAt,
      note: input.note ?? null,
      source: input.source ?? 'manual',
      feedTimeId: input.feedTimeId ?? null,
      medicationId: input.medicationId ?? null,
      notificationId: input.notificationId ?? null,
      createdBy: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    // Newest-first, matching the previous in-memory LogsContext ordering.
    await logsCol.mutate((cache) => [entry, ...cache]);
    return entry;
  };

  const removeLogsForPet = async (petId: string): Promise<void> => {
    await logsCol.mutate((cache) => cache.filter((l) => l.petId !== petId));
  };

  // ---- appointments extras ----
  const removePetRef = async (petId: string): Promise<void> => {
    await apptsCol.mutate((cache) => detachPet(cache, petId));
  };

  // ---- demo / reset affordances (Wave 3) ----
  const loadDemoData = async (): Promise<void> => {
    await AsyncStorage.setItem(KEY_SEEDED, '1');
    await petsCol.replaceAll(demoPets);
    await feedTimesCol.replaceAll(demoFeedTimes);
    await medicationsCol.replaceAll(demoMedications);
    await logsCol.replaceAll(demoTimeline);
    await apptsCol.replaceAll(demoAppointments);
  };

  const resetAll = async (): Promise<void> => {
    await AsyncStorage.setItem(KEY_SEEDED, '1');
    await petsCol.replaceAll([]);
    await feedTimesCol.replaceAll([]);
    await medicationsCol.replaceAll([]);
    await logsCol.replaceAll([]);
    await apptsCol.replaceAll([]);
  };

  return {
    pets: {
      list: petsCol.list,
      upsert: petsCol.upsert,
      remove: petsCol.remove,
      subscribe: petsCol.subscribe,
      deleteCascade,
      replaceFeedTimes,
      replaceMedications,
    },
    feedTimes: {
      list: feedTimesCol.list,
      upsert: feedTimesCol.upsert,
      remove: feedTimesCol.remove,
      subscribe: feedTimesCol.subscribe,
    },
    medications: {
      list: medicationsCol.list,
      upsert: medicationsCol.upsert,
      remove: medicationsCol.remove,
      subscribe: medicationsCol.subscribe,
    },
    logs: {
      list: logsCol.list,
      upsert: logsCol.upsert,
      remove: logsCol.remove,
      subscribe: logsCol.subscribe,
      add: addLog,
      removeForPet: removeLogsForPet,
    },
    appointments: {
      list: apptsCol.list,
      upsert: apptsCol.upsert,
      remove: apptsCol.remove,
      subscribe: apptsCol.subscribe,
      removePetRef,
    },
    loadDemoData,
    resetAll,
  };
}
