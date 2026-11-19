/**
 * Household-level composition of the modules' reminders and nudges — the care-module
 * counterpart of computeDesiredNotifications / computePendingNudges, ready for the scheduler
 * loop to switch onto (plan, "How screens use it": the `['pee','poo']` loops become
 * `plan.flatMap(m => m.reminders?.(s, prefs) ?? [])`).
 *
 * Mute, quiet hours, snooze and "never in the past" stay global and untouched: the modules
 * wrap the existing builders, which already apply them per item.
 *
 * With every pet on potty, meals, meds and visits, both functions return exactly what the
 * legacy functions return, in the same order (lib/__tests__/careModules.test.ts).
 */
import type { Appointment, FeedTime, LogEntry, Medication, Pet } from '../db/models';
import type { DesiredNotification, NotificationPrefs } from '../notifications/scheduler';
import type { PendingNudge } from '../notifications/pending';
import { appointmentReminders } from './engines/calendar';
import { buildSnapshot, inEmissionOrder, resolvePlan } from './plan';

function indexByPet<T extends { petId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.petId);
    if (list) list.push(item);
    else map.set(item.petId, [item]);
  }
  return map;
}

/**
 * An appointment's reminders are sent unless EVERY pet it names is a known pet with the visits
 * module switched off. A household appointment (no pet), or one naming a pet this device does
 * not know, is always sent — as today.
 */
function appointmentWanted(appt: Appointment, petsById: Map<string, Pet>): boolean {
  if (appt.petIds.length === 0) return true;
  return appt.petIds.some((id) => {
    const pet = petsById.get(id);
    return !pet || resolvePlan(pet).some((m) => m.id === 'visits');
  });
}

export function careDesiredNotifications(
  pets: Pet[],
  feedTimes: FeedTime[],
  medications: Medication[],
  logs: LogEntry[],
  appts: Appointment[],
  prefs: NotificationPrefs,
  now: Date = new Date(),
): DesiredNotification[] {
  const muted = new Set(prefs.mutedPetIds);
  const feedByPet = indexByPet(feedTimes);
  const medsByPet = indexByPet(medications);
  const logsByPet = indexByPet(logs);
  const raw: DesiredNotification[] = [];

  for (const pet of pets) {
    if (pet.archivedAt || muted.has(pet.id)) continue;
    // Appointments are emitted once per household below, after every pet, as today.
    const s = buildSnapshot({
      pet,
      feedTimes: feedByPet.get(pet.id) ?? [],
      meds: medsByPet.get(pet.id) ?? [],
      logs: logsByPet.get(pet.id) ?? [],
      appts: [],
      now,
    });
    for (const m of inEmissionOrder(resolvePlan(pet))) {
      if (m.reminders) raw.push(...m.reminders(s, prefs));
    }
  }

  const petsById = new Map(pets.map((p) => [p.id, p]));
  raw.push(...appointmentReminders(appts.filter((a) => appointmentWanted(a, petsById)), prefs, now));

  // Each builder already applied snooze / quiet hours / past; only the cross-call dedupe is left.
  const seen = new Set<string>();
  return raw.filter((d) => (seen.has(d.key) ? false : (seen.add(d.key), true)));
}

export function carePendingNudges(
  pets: Pet[],
  feedTimes: FeedTime[],
  medications: Medication[],
  logs: LogEntry[],
  now: Date = new Date(),
  snoozes: Record<string, number> = {},
): PendingNudge[] {
  const feedByPet = indexByPet(feedTimes);
  const medsByPet = indexByPet(medications);
  const logsByPet = indexByPet(logs);
  const out: PendingNudge[] = [];

  for (const pet of pets) {
    if (pet.archivedAt) continue;
    const s = buildSnapshot({
      pet,
      feedTimes: feedByPet.get(pet.id) ?? [],
      meds: medsByPet.get(pet.id) ?? [],
      logs: logsByPet.get(pet.id) ?? [],
      appts: [],
      now,
    });
    for (const m of inEmissionOrder(resolvePlan(pet))) {
      if (m.nudges) out.push(...m.nudges(s, snoozes));
    }
  }

  // Stable sort, so ties keep emission order exactly as computePendingNudges does.
  return out.sort((a, b) => b.overdueBy - a.overdueBy);
}
