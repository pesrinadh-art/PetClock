/**
 * Care-module contract (docs/CARE_MODULES_PLAN.md, "Module contract").
 *
 * Pure TypeScript — no React, no context, no repo — so every module is testable in plain Node.
 * Every facet is OPTIONAL: a module implements only what it needs.
 */
import type { IconName } from '../../components/Icon';
import type {
  Appointment,
  CareModuleId,
  FeedTime,
  LogEntry,
  LogType,
  Medication,
  Pet,
  Species,
} from '../db/models';
import type { UpcomingItem } from '../petSchedule';
import type { DesiredNotification, NotificationPrefs } from '../notifications/scheduler';
import type { PendingNudge } from '../notifications/pending';
import type { NewLogInput } from '../repo/types';

export type { CareModuleId } from '../db/models';

/** Wording a species contributes to module copy. Data only; never branched on by screens. */
export type SpeciesWording = {
  /** The owner's phrase for a potty break: "potty break", "litter box trip". */
  pottyBreak: string;
  /** Where/how potty happens: "potty walk", "litter box". */
  pottyPlace: string;
  /** The habitat-cleaning noun ("tank", "cage", "litter tray"), or null when not offered. */
  habitatNoun: string | null;
};

/** One row of lib/care/species.ts. */
export type SpeciesProfile = {
  species: Species;
  /** Modules the owner may choose from for this species. */
  offered: readonly CareModuleId[];
  /** Pre-ticked for a NEW pet. Existing pets keep their stored list. */
  defaults: readonly CareModuleId[];
  wording: SpeciesWording;
  /** Suggested habitat cleaning interval (Phase 2), when the species has a sensible one. */
  habitatIntervalDays?: number;
};

/** Everything a module may read about one pet, at one instant. */
export interface CareSnapshot {
  pet: Pet;
  feedTimes: FeedTime[];
  meds: Medication[];
  logs: LogEntry[];
  appts: Appointment[];
  now: Date;
  profile: SpeciesProfile;
  /**
   * The household's IANA timezone (`households.timezone`), or null when unknown. Wall clocks
   * (feed-time anchors, habitat's 10:00 due time) resolve in it; null means the device zone,
   * exactly as before households carried one.
   */
  timeZone: string | null;
}

/** A module's own readiness. The pet's overall status is derived in plan.ts. */
export type CareModuleStatus = 'ready' | 'calibrating' | 'needsInfo';

/** Which hero layout the data describes. */
export type HeroState = 'upcoming' | 'due' | 'late' | 'learning' | 'needsInfo' | 'idle' | 'caughtUp';

/**
 * The Today hero, as DATA ONLY (no React): what PetCard draws in its text column and ring.
 * `progress` null = an empty ring; 0..1 fills it (callers clamp).
 */
export type HeroModel = {
  /** The module that produced it; null for the plan-level "all caught up" fallback. */
  moduleId: CareModuleId | null;
  state: HeroState;
  kicker: string;
  headline: string;
  /** '' when there is nothing to show. */
  detail: string;
  progress: number | null;
  late: boolean;
  /** Headline is a countdown, drawn in the mono face. */
  headlineMono: boolean;
};

/**
 * One "+ Log" action. `writes` are the logs ONE tap records, all at the same instant (so
 * "Both" is a pee and a poo at one time, undone together). The id / pet / household / instant
 * are supplied when the action runs, never here: the log id is the idempotency key and must be
 * minted once per user action, not once per render.
 */
export type QuickLogAction = {
  key: string;
  icon: IconName;
  label: string;
  /** "Log when did Mochi ___?" — the verb the time chooser uses. */
  verb: string;
  writes: NewLogInput[];
};

/** An Upcoming row, tagged with the module that produced it and its drawn line icon. */
export type CareUpcomingItem = UpcomingItem & { moduleId: CareModuleId; lineIcon: IconName };

export interface CareModule {
  id: CareModuleId;
  /** Hero priority, lowest first: potty 10, walks 20, meds 30, meals 40, habitat 50, visits 60. */
  priority: number;
  appliesTo: readonly Species[];
  /** The only log types this module may read or write. */
  logTypes: readonly LogType[];
  /**
   * Keep this module's Upcoming rows while the pet is still learning / needs info. Today only
   * medication rows show then (user-set times, nothing to learn); learned rows wait.
   */
  upcomingWhileLearning?: boolean;
  status?(s: CareSnapshot): CareModuleStatus;
  upcoming?(s: CareSnapshot): UpcomingItem[];
  hero?(s: CareSnapshot): HeroModel | null;
  quickLog?(s: CareSnapshot): QuickLogAction[];
  reminders?(s: CareSnapshot, prefs: NotificationPrefs): DesiredNotification[];
  nudges?(s: CareSnapshot, snoozes: Record<string, number>): PendingNudge[];
}
