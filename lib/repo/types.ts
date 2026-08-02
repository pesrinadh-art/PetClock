import type { Appointment, FeedTime, LogEntry, LogType, Medication, Pet } from '../db/models';
import { ReposFacade } from './facade';
import { createLocalRepos } from './local';
// Side-effect import: runs SplashScreen.preventAutoHideAsync() at boot (see lib/splash.ts).
// Placed here because every context imports `repos` from this module during app start-up.
import '../splash';

/**
 * The storage-agnostic contract every collection speaks. Today it is backed by
 * AsyncStorage (`createLocalRepos`); at the synced SYNC-1 wave the same interface
 * is re-implemented against Supabase and swapped in at the single `repos = ...`
 * line below — no context or screen changes.
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
 * Input to `logs.add` — the caller supplies only the domain facts; the repo mints
 * the id (a client-generated uuid v4, the offline idempotency key), stamps the
 * household, `source` and timestamps, and defaults `occurredAt` to now. Mirrors the
 * contract's `NewLogInput` (`lib/db/models.ts`) minus the fields the local repo owns.
 */
export type NewLogInput = {
  type: LogType;
  /** ISO. Defaults to now inside the repo. */
  occurredAt?: string;
  note?: string | null;
  /** Δ1: which feed-time slot a food log covers. */
  feedTimeId?: string | null;
  /** Which medication dose a medication log records. */
  medicationId?: string | null;
};

/**
 * The app's repository surface: the generic `EntityRepo` per collection plus the
 * collection-specific extras the contexts need so existing behavior is preserved.
 */
export interface PawclockRepos {
  /** `deleteCascade` (D10) removes the pet, its logs, feed times and medications, and
   *  detaches it from every appointment — dropping any appointment left with no pets —
   *  persisting and notifying all collections in one operation. Race-safe last-pet guard.
   *  `replaceFeedTimes`/`replaceMedications` swap a pet's whole slot list (add-pet edits,
   *  AutoCalibrator) and notify their collections. */
  pets: EntityRepo<Pet> & {
    deleteCascade(petId: string): Promise<void>;
    replaceFeedTimes(petId: string, feedTimes: FeedTime[]): Promise<void>;
    replaceMedications(petId: string, medications: Medication[]): Promise<void>;
  };
  /** Feed times as their own collection (was Pet.feedTimes). Read via list/subscribe. */
  feedTimes: EntityRepo<FeedTime>;
  /** Medications as their own collection (was Pet.medications). Read via list/subscribe. */
  medications: EntityRepo<Medication>;
  logs: EntityRepo<LogEntry> & {
    add(petId: string, input: NewLogInput): Promise<LogEntry>;
    removeForPet(petId: string): Promise<void>;
  };
  appointments: EntityRepo<Appointment> & { removePetRef(petId: string): Promise<void> };

  /** Seed pets/feedTimes/medications/logs/appointments from `data/mockData` and notify. */
  loadDemoData(): Promise<void>;
  /** Clear every collection and notify (Wave-3 "Reset all data"). */
  resetAll(): Promise<void>;
}

/**
 * The single stable repo surface every context imports. It is backed by the LOCAL repo by
 * default, so with `EXPO_PUBLIC_USE_SUPABASE` off (or a failed session) behaviour is
 * identical to today — offline, on-device. In synced mode `SessionContext` calls
 * {@link activateSyncedRepos} once a session + household id exist; the facade hot-swaps the
 * backing impl and re-hydrates every mounted collection. Default and fallback are always
 * the working local repo, so the app is never broken by the flag or a session failure.
 */
const facade = new ReposFacade(createLocalRepos());

export const repos: PawclockRepos = facade.repos;

/**
 * Swap `repos` to a Supabase-backed implementation and re-pull every mounted collection.
 * Idempotent per session — `SessionContext` gates it on `ready` and guards double-calls.
 */
export function activateSyncedRepos(impl: PawclockRepos): void {
  facade.swap(impl);
}

// Convenience named re-exports for the Wave-3 Settings affordances.
export const loadDemoData = (): Promise<void> => repos.loadDemoData();
export const resetAll = (): Promise<void> => repos.resetAll();
