import { StyleSheet, View } from 'react-native';
import type { Pet } from '../data/mockData';
import {
  countLogsToday,
  formatTimeUntilCompact,
  getPetStatus,
  getTodaysMeals,
  getUpcomingForPet,
} from '../lib/petSchedule';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { HeroCard, type Stat } from './ui';
import { PetAvatar } from './PetAvatar';

/**
 * The green gradient hero at the top of Home (screen 2a): a progress ring with a
 * paw at its centre, the pet's name + "breed · Nh hold time", and a divider with
 * three stats — Next break / Logs today / Meals. Built on the shared
 * {@link HeroCard}. All the numbers come from the same schedule helpers the old
 * card used; only the presentation changed.
 */
export function PetCard({ pet }: { pet: Pet }) {
  const { getLogsForPet } = useLogs();
  const { getFeedTimesForPet } = usePets();
  const petLogs = getLogsForPet(pet.id);
  const feedTimes = getFeedTimesForPet(pet.id);
  const status = getPetStatus(pet, feedTimes);
  const now = new Date();

  const meals = getTodaysMeals(feedTimes, now, petLogs);
  const mealsTotal = meals.length;
  const mealsDone = meals.filter((m) => m.status === 'done').length;
  const mealsStat = mealsTotal > 0 ? `${mealsDone}/${mealsTotal}` : '—';

  const meta = pet.breed || 'Pet';
  let subtitle = meta;
  let nextBreakDisplay = '—';
  let progress: number | undefined;

  if (status.kind === 'calibrating') {
    subtitle = `${meta} · Day ${status.day} of calibration`;
  } else if (status.kind === 'needsInfo') {
    subtitle = `${meta} · Needs setup`;
  } else {
    const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
    if (Number.isFinite(tightestHold)) subtitle = `${meta} · ${tightestHold}h hold time`;
    const nextBreak = getUpcomingForPet(pet, feedTimes, petLogs, now).find((u) => u.type !== 'food');
    if (nextBreak) {
      nextBreakDisplay = formatTimeUntilCompact(nextBreak.timeStart, now);
      // Ring fills as the next break approaches: 0 just after a break, 1 at/after due.
      if (Number.isFinite(tightestHold) && tightestHold > 0) {
        const holdMs = tightestHold * 60 * 60 * 1000;
        const remaining = nextBreak.timeStart.getTime() - now.getTime();
        progress = Math.max(0, Math.min(1, 1 - remaining / holdMs));
      }
    }
  }

  const stats: Stat[] = [
    { value: nextBreakDisplay, label: 'Next break' },
    { value: String(countLogsToday(petLogs, now)), label: 'Logs today' },
    { value: mealsStat, label: 'Meals' },
  ];

  // Ready pets get the progress ring; calibrating / needs-info pets get the pet
  // avatar so the hero still reads as "this pet".
  const leading =
    progress == null ? (
      <View style={styles.avatarWrap}>
        <PetAvatar pet={pet} size={44} emojiSize={24} style={styles.avatar} />
      </View>
    ) : undefined;

  return (
    <HeroCard
      title={pet.name}
      subtitle={subtitle}
      progress={progress}
      leading={leading}
      stats={stats}
      style={styles.hero}
    />
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 18 },
  avatarWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { backgroundColor: 'rgba(255,255,255,0.18)' },
});
