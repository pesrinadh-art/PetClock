import { StyleSheet } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { formatClock, getTodaysMeals } from '../lib/petSchedule';
import { repos } from '../lib/repo/types';
import { loggedLine, timeFor } from '../lib/petVoice';
import { space } from '../theme/colors';
import { Banner, successFeedback } from './ui';
import { useSnackbar } from './Snackbar';
import { useNow } from '../hooks/useNow';

/**
 * A one-tap "mark the due meal fed" shortcut. It surfaces ONLY while a meal is genuinely due — the
 * same `getTodaysMeals` + due-meal selection {@link MealTimeBanner} uses (snooze included) — and not
 * yet logged; otherwise it returns null. Logging goes through the very same path as the banner and
 * quick-log — `type:'food'` with the slot's `feedTimeId` (Δ1) — so the exact meal row flips to done
 * and this shortcut falls away.
 *
 * NOTE: Home surfaces the due meal through MealTimeBanner and the "Fed" quick-log tile, so this
 * component is not rendered there; it is kept (restyled as a food Banner) for reuse elsewhere.
 */
export function FoodQuickLogButton({ pet }: { pet: Pet }) {
  const { getFeedTimesForPet } = usePets();
  const { getLogsForPet, removeLog } = useLogs();
  const { isSnoozed } = useNudges();
  const { show } = useSnackbar();
  const now = useNow();

  const meals = getTodaysMeals(getFeedTimesForPet(pet.id), now, getLogsForPet(pet.id));
  const dueMeal = meals.find(
    (m) => m.status === 'due' && !isSnoozed(nudgeKey(pet.id, m.id), now),
  );

  if (!dueMeal) return null;

  const handleLog = async () => {
    // Δ1: reference the slot by feedTimeId — identical to MealTimeBanner / food.tsx — so this exact
    // meal row flips to 'done', which then makes dueMeal undefined and this shortcut return null.
    const entry = await repos.logs.add(pet.id, { type: 'food', feedTimeId: dueMeal.feedTimeId ?? null });
    successFeedback();
    show(loggedLine(pet, 'food'), () => removeLog(entry.id));
  };

  const mealWord = dueMeal.name.toLowerCase();

  return (
    <Banner
      tone="food"
      icon="bowl"
      title={timeFor(pet.name, mealWord)}
      body={`Usually around ${formatClock(dueMeal.time)}`}
      action={{ label: `Log ${mealWord}`, icon: 'check', onPress: () => void handleLog() }}
      style={styles.banner}
    />
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: space.sm },
});
