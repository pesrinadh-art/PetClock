import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import type { EntityRepo, PawclockRepos } from './types';

type Listener = () => void;

/**
 * A stable {@link EntityRepo} whose backing implementation can be swapped at runtime.
 *
 * `usePersistedCollection` subscribes to this object ONCE on mount (its effect deps are
 * `[repo]`, and this object's identity never changes). When the backing repo is swapped
 * — local → synced, once `SessionContext` reports ready — {@link rebind} drops the old
 * inner subscription, attaches to the new impl, and fires every listener so each mounted
 * collection re-pulls from the new source. The hook's effect never re-runs; the data just
 * refreshes. This is the whole trick behind hot-swapping a static singleton.
 */
class CollectionFacade<T extends { id: string }> implements EntityRepo<T> {
  private innerUnsub: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly getInner: () => EntityRepo<T>) {}

  /** Attach to the current inner repo (once, and only while we have listeners). */
  private bind(): void {
    if (this.innerUnsub || this.listeners.size === 0) return;
    this.innerUnsub = this.getInner().subscribe(() => {
      for (const l of this.listeners) l();
    });
  }

  /** Re-point at a freshly-swapped inner repo and force every listener to re-pull. */
  rebind(): void {
    if (this.innerUnsub) {
      this.innerUnsub();
      this.innerUnsub = null;
    }
    this.bind();
    for (const l of this.listeners) l();
  }

  list = (): Promise<T[]> => this.getInner().list();
  upsert = (item: T): Promise<T> => this.getInner().upsert(item);
  remove = (id: string): Promise<void> => this.getInner().remove(id);

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    this.bind();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.innerUnsub) {
        this.innerUnsub();
        this.innerUnsub = null;
      }
    };
  };
}

/**
 * Wraps the whole {@link PawclockRepos} surface behind stable references so the backing
 * implementation can be swapped without any context or screen re-importing anything. The
 * generic CRUD/subscribe methods route through per-collection {@link CollectionFacade}s;
 * the collection-specific extras (deleteCascade, add, removePetRef, …) delegate straight
 * to the live impl on each call (they are one-shot mutations, no subscription to rebind).
 */
export class ReposFacade {
  private impl: PawclockRepos;

  private readonly petsF: CollectionFacade<Pet>;
  private readonly feedTimesF: CollectionFacade<FeedTime>;
  private readonly medicationsF: CollectionFacade<Medication>;
  private readonly logsF: CollectionFacade<LogEntry>;
  private readonly appointmentsF: CollectionFacade<Appointment>;

  /** The single stable object every context imports as `repos`. */
  readonly repos: PawclockRepos;

  constructor(initial: PawclockRepos) {
    this.impl = initial;
    this.petsF = new CollectionFacade(() => this.impl.pets);
    this.feedTimesF = new CollectionFacade(() => this.impl.feedTimes);
    this.medicationsF = new CollectionFacade(() => this.impl.medications);
    this.logsF = new CollectionFacade(() => this.impl.logs);
    this.appointmentsF = new CollectionFacade(() => this.impl.appointments);

    this.repos = {
      pets: {
        list: this.petsF.list,
        upsert: this.petsF.upsert,
        remove: this.petsF.remove,
        subscribe: this.petsF.subscribe,
        deleteCascade: (petId) => this.impl.pets.deleteCascade(petId),
        replaceFeedTimes: (petId, feedTimes) => this.impl.pets.replaceFeedTimes(petId, feedTimes),
        replaceMedications: (petId, meds) => this.impl.pets.replaceMedications(petId, meds),
      },
      feedTimes: {
        list: this.feedTimesF.list,
        upsert: this.feedTimesF.upsert,
        remove: this.feedTimesF.remove,
        subscribe: this.feedTimesF.subscribe,
      },
      medications: {
        list: this.medicationsF.list,
        upsert: this.medicationsF.upsert,
        remove: this.medicationsF.remove,
        subscribe: this.medicationsF.subscribe,
      },
      logs: {
        list: this.logsF.list,
        upsert: this.logsF.upsert,
        remove: this.logsF.remove,
        subscribe: this.logsF.subscribe,
        add: (petId, input) => this.impl.logs.add(petId, input),
        removeForPet: (petId) => this.impl.logs.removeForPet(petId),
      },
      appointments: {
        list: this.appointmentsF.list,
        upsert: this.appointmentsF.upsert,
        remove: this.appointmentsF.remove,
        subscribe: this.appointmentsF.subscribe,
        removePetRef: (petId) => this.impl.appointments.removePetRef(petId),
      },
      loadDemoData: () => this.impl.loadDemoData(),
      resetAll: () => this.impl.resetAll(),
    };
  }

  /** Swap the backing implementation and re-hydrate every mounted collection. */
  swap(next: PawclockRepos): void {
    this.impl = next;
    this.petsF.rebind();
    this.feedTimesF.rebind();
    this.medicationsF.rebind();
    this.logsF.rebind();
    this.appointmentsF.rebind();
  }
}
