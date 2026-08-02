import type { Appointment, Pet, TimelineEntry } from '../../data/mockData';
import { createLocalRepos } from './local';
// Side-effect import: runs SplashScreen.preventAutoHideAsync() at boot (see lib/splash.ts).
// Placed here because every context imports `repos` from this module during app start-up.
import '../splash';

/**
 * The storage-agnostic contract every collection speaks. Today it is backed by
 * AsyncStorage (`createLocalRepos`); at SYNC 1 the same interface is re-implemented
 * against Supabase and swapped in at the single `repos = ...` line below — no
 * context or screen changes.
 *
 * `subscribe` is the crucial seam: it fires after ANY mutation, including writes
 * made outside React (FE-3 headless notification responses), which is how mounted
 * contexts re-hydrate without a dedicated sync path.
 */
export interface EntityRepo<T extends { id: string }> {
  list(): Promise<T[]>;
  upsert(item: T): Promise<T>;
  remove(id: string): Promise<void>;
  /** Fires after any mutation (incl. headless writes). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}

/**
 * Input to `logs.add` — mirrors the historical `NewLog` shape from LogsContext so
 * the id/timestamp are minted inside the repo (the id is the offline idempotency
 * key). `sub` is accepted for call-site parity but ignored (display derives from
 * `timestamp`, D5).
 */
export type NewLogInput = {
  type: TimelineEntry['type'];
  icon: string;
  label: string;
  /** @deprecated Ignored — display strings derive from `timestamp` at render (D5). */
  sub?: string;
  timestamp?: number;
};

/**
 * The app's repository surface: the generic `EntityRepo` per collection plus the
 * collection-specific extras the contexts need so existing behavior is preserved.
 */
export interface PawclockRepos {
  /** `deleteCascade` (D10) removes the pet, its logs, and detaches it from every
   *  appointment — dropping any appointment left with no pets — persisting and
   *  notifying all three collections in one operation. Race-safe last-pet guard. */
  pets: EntityRepo<Pet> & { deleteCascade(petId: string): Promise<void> };
  logs: EntityRepo<TimelineEntry> & {
    add(petId: string, input: NewLogInput): Promise<TimelineEntry>;
    removeForPet(petId: string): Promise<void>;
  };
  appointments: EntityRepo<Appointment> & { removePetRef(petId: string): Promise<void> };

  /** Seed pets/logs/appointments from `data/mockData` and notify (Wave-3 "Load demo data"). */
  loadDemoData(): Promise<void>;
  /** Clear every collection and notify (Wave-3 "Reset all data"). */
  resetAll(): Promise<void>;
}

/** The one-line swap point: replace `createLocalRepos()` with the synced repo at SYNC 1. */
export const repos: PawclockRepos = createLocalRepos();

// Convenience named re-exports for the Wave-3 Settings affordances.
export const loadDemoData = (): Promise<void> => repos.loadDemoData();
export const resetAll = (): Promise<void> => repos.resetAll();
