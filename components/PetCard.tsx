import { StyleSheet } from 'react-native';
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
import { useNow } from '../hooks/useNow';
import { space } from '../theme/colors';
import { friendlyIn, gentleLate, petMeta, pottyBreakPhrase, progressLine } from '../lib/petVoice';
import { HeroCard, ProgressBar, type Stat } from './ui';
import { PetAvatar } from './PetAvatar';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The green hero at the top of Home. It answers the owner's first question at
 * a glance: "when is the next break?" The title is the next potty walk / litter
 * box trip in friendly words, the subtitle is the pet's meta line, and a meal
 * progress bar sits underneath. All numbers come from the same schedule helpers
 * as before; only the presentation and copy changed.
 */
export function PetCard({ pet }: { pet: Pet }) {
  const { getLogsForPet } = useLogs();
  const { getFeedTimesForPet } = usePets();
  const now = useNow();
  const petLogs = getLogsForPet(pet.id);
  const feedTimes = getFeedTimesForPet(pet.id);
  const status = getPetStatus(pet, feedTimes);

  const meals = getTodaysMeals(feedTimes, now, petLogs);
  const mealsTotal = meals.length;
  const mealsDone = meals.filter((m) => m.status === 'done').length;

  const breakPhrase = capitalize(pottyBreakPhrase(pet.species));
  const meta = petMeta(pet, now);

  let title = `${breakPhrase}s for ${pet.name}`;
  let subtitle = meta;
  let nextBreakDisplay = '—';
  let progress: number | undefined;

  if (status.kind === 'calibrating') {
    title = `Getting to know ${pet.name}`;
    subtitle = `Day ${status.day} of 3 · keep logging and we'll learn the routine`;
  } else if (status.kind === 'needsInfo') {
    title = `Let's set up ${pet.name}'s routine`;
    subtitle = meta;
  } else {
    const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
    if (Number.isFinite(tightestHold)) subtitle = `${meta} · holds about ${tightestHold}h`;
    const nextBreak = getUpcomingForPet(pet, feedTimes, petLogs, now).find((u) => u.type !== 'food');
    if (nextBreak) {
      nextBreakDisplay = formatTimeUntilCompact(nextBreak.timeStart, now);
      if (nextBreak.kind === 'overdue') {
        title = `${breakPhrase} is ${gentleLate(Math.round(nextBreak.overdueBy / 60000))}`;
      } else if (nextBreak.kind === 'due') {
        title = `${breakPhrase} time`;
      } else {
        title = `Next ${pottyBreakPhrase(pet.species)} ${friendlyIn(nextBreak.timeStart, now)}`;
      }
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
  ];
  // With a meal plan the progress bar below carries meals; otherwise keep a
  // placeholder stat so the row stays balanced.
  if (mealsTotal === 0) stats.push({ value: '—', label: 'Meals' });

  // Ready pets get the "time to next break" ring; calibrating / needs-info pets
  // get their own face so the hero still reads as "this pet".
  const leading =
    progress == null ? <PetAvatar pet={pet} size={60} emojiSize={32} ring="onDark" /> : undefined;

  return (
    <HeroCard
      title={title}
      subtitle={subtitle}
      progress={progress}
      leading={leading}
      stats={stats}
      style={styles.hero}
    >
      {mealsTotal > 0 ? (
        <ProgressBar
          variant="onDark"
          value={mealsDone}
          total={mealsTotal}
          label="Meals today"
          caption={progressLine(mealsDone, mealsTotal)}
        />
      ) : null}
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: space.lg },
});
