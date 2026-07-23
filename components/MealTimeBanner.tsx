import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { getTodaysMeals } from '../lib/petSchedule';

const SNOOZE_MS = 30 * 60 * 1000;

/**
 * Prompts for exactly one meal at a time — whichever is actually due right now — instead of a
 * generic "Fed" button. That's what makes it safe: since only the currently-due meal is ever
 * actionable, there's no way to rush through "Done Feeding" twice and accidentally mark a later
 * meal (e.g. Dinner) done before its time just because an earlier one (e.g. Brunch) was tapped.
 */
export function MealTimeBanner({ pet }: { pet: Pet }) {
  const { getLogsForPet, addLog } = useLogs();
  const { snooze, isSnoozed } = useNudges();

  const now = new Date();
  const meals = getTodaysMeals(pet, now, getLogsForPet(pet.id));
  const dueMeal = meals.find(
    (m) => m.status === 'due' && !isSnoozed(nudgeKey(pet.id, m.id), now)
  );

  if (!dueMeal) return null;

  const handleDoneFeeding = () => {
    addLog(pet.id, { type: 'food', icon: dueMeal.icon, label: dueMeal.name, sub: 'Logged just now' });
  };

  const handleSnooze = () => {
    snooze(nudgeKey(pet.id, dueMeal.id), Date.now() + SNOOZE_MS);
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>{dueMeal.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{dueMeal.name} time is here!</Text>
        <Text style={styles.body}>Let us know once {pet.name}'s eaten.</Text>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.doneBtn, pressed && styles.pressed]}
            onPress={handleDoneFeeding}
          >
            <Text style={styles.doneBtnText}>✅ Done Feeding</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.snoozeBtn, pressed && styles.pressed]}
            onPress={handleSnooze}
          >
            <Text style={styles.snoozeBtnText}>⏰ Remind in 30 min</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.food,
    backgroundColor: colors.foodLight,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 16,
    ...shadow.sm,
  },
  icon: { fontSize: 22 },
  title: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 2 },
  body: { fontSize: 12, color: colors.stoneMid, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  pressed: { opacity: 0.8 },
  doneBtn: { backgroundColor: colors.food },
  doneBtnText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.white },
  snoozeBtn: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.stoneLight },
  snoozeBtnText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.stoneMid },
});
