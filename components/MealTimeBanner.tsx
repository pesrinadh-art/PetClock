import { StyleSheet } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { formatClock, getTodaysMeals } from '../lib/petSchedule';
import { possessive, timeFor } from '../lib/petVoice';
import { space } from '../theme/colors';
import { Banner, successFeedback } from './ui';

const SNOOZE_MS = 30 * 60 * 1000;

/**
 * The meal-time prompt on Home: a warm terracotta Banner — "Time for Mochi's
 * dinner" / "Usually around 6:00 PM" — with a big "Log dinner" button and a
 * quiet "Remind me in 30 min". It prompts for exactly one meal at a time
 * (whichever is actually due), so a later meal can't be marked done early.
 * "Log" writes the slot by feedTimeId (Δ1); snooze defers it 30 min.
 */
export function MealTimeBanner({ pet }: { pet: Pet }) {
  const { getLogsForPet, addLog } = useLogs();
  const { getFeedTimesForPet } = usePets();
  const { snooze, isSnoozed } = useNudges();

  const now = new Date();
  const meals = getTodaysMeals(getFeedTimesForPet(pet.id), now, getLogsForPet(pet.id));
  const dueMeal = meals.find(
    (m) => m.status === 'due' && !isSnoozed(nudgeKey(pet.id, m.id), now)
  );

  if (!dueMeal) return null;

  const handleDoneFeeding = () => {
    // Δ1: reference the slot by feedTimeId so this exact meal row flips to done.
    addLog(pet.id, { type: 'food', feedTimeId: dueMeal.feedTimeId ?? null });
    successFeedback();
  };

  const handleSnooze = () => {
    snooze(nudgeKey(pet.id, dueMeal.id), Date.now() + SNOOZE_MS);
  };

  const mealWord = dueMeal.name.toLowerCase();

  return (
    <Banner
      tone="food"
      icon="bowl"
      title={timeFor(pet.name, mealWord)}
      body={`Usually around ${formatClock(dueMeal.time)}. Tap once ${pet.name} has eaten.`}
      action={{ label: `Log ${mealWord}`, icon: 'check', onPress: handleDoneFeeding, accessibilityLabel: `Log ${possessive(pet.name)} ${mealWord}` }}
      secondaryAction={{ label: 'Remind me in 30 min', onPress: handleSnooze, accessibilityLabel: `Remind me about ${possessive(pet.name)} ${mealWord} in 30 minutes` }}
      style={styles.banner}
    />
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: space.lg },
});
