import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { formatClock, getTodaysMeals } from '../lib/petSchedule';
import { repos } from '../lib/repo/types';
import { useSnackbar } from './Snackbar';
import { useNow } from '../hooks/useNow';

/** Fire-and-forget success haptic; no-op on web and never throws (mirrors LogButtons). */
function successHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * A one-tap "mark the due meal fed" shortcut for the Home "Log Now" area, sitting just below the
 * pee/poo {@link LogButtons}. It surfaces ONLY while a meal is genuinely due — the same
 * `getTodaysMeals` + due-meal selection {@link MealTimeBanner} uses (snooze included) — and not
 * yet logged; otherwise it returns null so Home stays clean. It predicts nothing itself; it just
 * reuses the existing meal state.
 *
 * This is deliberately NOT a second MealTimeBanner: the banner higher up is the full prompt (with
 * a snooze action); this is a compact quick action in the Log Now row. Both read the identical due
 * meal, so they appear and disappear together and can never disagree. Logging goes through the very
 * same path as the banner and the Food screen — `type:'food'` with the slot's `feedTimeId` (Δ1) —
 * so the exact meal row flips to done and this button then falls away.
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
    // meal row flips to 'done', which then makes dueMeal undefined and this button return null.
    // repos.logs.add (not the void addLog) hands back the entry so Undo can revert this one log.
    const entry = await repos.logs.add(pet.id, { type: 'food', feedTimeId: dueMeal.feedTimeId ?? null });
    successHaptic();
    show(`${dueMeal.name} logged for ${pet.name}`, () => removeLog(entry.id));
  };

  return (
    <Pressable
      onPress={() => void handleLog()}
      role="button"
      aria-label={`Log ${dueMeal.name} as fed for ${pet.name}. Due ${formatClock(dueMeal.time)}.`}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Text style={styles.emoji}>{dueMeal.icon}</Text>
      <View style={styles.text}>
        <Text style={styles.label}>Log {dueMeal.name}</Text>
        <Text style={styles.sub}>Due {formatClock(dueMeal.time)} · one tap to mark {pet.name} fed</Text>
      </View>
      <Text style={styles.check}>✅</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: colors.food,
    backgroundColor: colors.foodLight,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 20,
    ...shadow.sm,
  },
  btnPressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  emoji: { fontSize: 26 },
  text: { flex: 1 },
  label: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  sub: { fontSize: 11, color: colors.stoneMid, marginTop: 2 },
  check: { fontSize: 20 },
});
