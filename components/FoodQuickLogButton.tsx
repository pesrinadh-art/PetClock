import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ink, radius, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { formatClock, getTodaysMeals } from '../lib/petSchedule';
import { repos } from '../lib/repo/types';
import { Card } from './ui';
import { Icon } from './Icon';
import { useSnackbar } from './Snackbar';
import { useNow } from '../hooks/useNow';

/** Fire-and-forget success haptic; no-op on web and never throws (mirrors LogButtons). */
function successHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * A one-tap "mark the due meal fed" shortcut. It surfaces ONLY while a meal is genuinely due — the
 * same `getTodaysMeals` + due-meal selection {@link MealTimeBanner} uses (snooze included) — and not
 * yet logged; otherwise it returns null. It predicts nothing itself; it just reuses the existing
 * meal state. Logging goes through the very same path as the banner and quick-log — `type:'food'`
 * with the slot's `feedTimeId` (Δ1) — so the exact meal row flips to done and this button falls away.
 *
 * NOTE: the redesigned Home (screen 2a) surfaces the due meal through the MealTimeBanner attention
 * card and the "Fed" quick-log tile instead, so this component is not rendered there; it is kept
 * (reskinned to the design tokens) for reuse elsewhere.
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
    const entry = await repos.logs.add(pet.id, { type: 'food', feedTimeId: dueMeal.feedTimeId ?? null });
    successHaptic();
    show(`${dueMeal.name} logged for ${pet.name}`, () => removeLog(entry.id));
  };

  return (
    <Pressable
      onPress={() => void handleLog()}
      role="button"
      aria-label={`Log ${dueMeal.name} as fed for ${pet.name}. Due ${formatClock(dueMeal.time)}.`}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card padded style={styles.card}>
        <View style={styles.tile}>
          <Icon name="bowl" size={16} color={terracotta.primary} strokeWidth={2} />
        </View>
        <View style={styles.text}>
          <Text style={styles.label}>Log {dueMeal.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>Due {formatClock(dueMeal.time)} · one tap to mark {pet.name} fed</Text>
        </View>
        <View style={styles.doneBtn}>
          <Icon name="check" size={16} color="#ffffff" strokeWidth={2.4} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: terracotta.primary,
  },
  tile: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    backgroundColor: terracotta.tint,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: { flex: 1 },
  label: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  sub: { fontSize: 11.5, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  doneBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTile,
    backgroundColor: terracotta.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
