import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, glass, ink, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { getTodaysMeals } from '../lib/petSchedule';
import { Icon } from './Icon';

const SNOOZE_MS = 30 * 60 * 1000;

/**
 * The meal "attention" banner (design v2 `.banner`): an accent-soft panel with a bowl line
 * icon, "<Meal> time", "Tell us once <pet> has eaten", and a violet "Done" pill beside a glass
 * "Snooze". It prompts for exactly one meal at a time — whichever is actually due right now —
 * so there's no way to mark a later meal done early. "Done" logs the slot by feedTimeId (Δ1);
 * "Snooze" defers it 30 min.
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
  };

  const handleSnooze = () => {
    snooze(nudgeKey(pet.id, dueMeal.id), Date.now() + SNOOZE_MS);
  };

  return (
    <View style={styles.banner}>
      <View style={styles.top}>
        <Icon name="bowl" size={18} color={accent.ink} strokeWidth={1.8} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>{dueMeal.name} time</Text>
          <Text style={styles.sub} numberOfLines={1}>Tell us once {pet.name} has eaten</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.doneBtn, pressed && styles.pressed]}
          onPress={handleDoneFeeding}
          role="button"
          aria-label={`Log ${dueMeal.name} as fed for ${pet.name}`}
        >
          <Text style={[styles.btnText, styles.doneText]}>Done</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          onPress={handleSnooze}
          role="button"
          aria-label="Remind me in 30 minutes"
          hitSlop={4}
        >
          <Text style={styles.btnText}>Snooze</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 10,
    padding: 14,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: accent.line,
    backgroundColor: accent.soft,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  text: { flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary, lineHeight: 18 },
  sub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 12 },
  btn: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
  },
  doneBtn: { backgroundColor: accent.primary, borderColor: 'transparent', ...shadow.fab, shadowOpacity: 0.3 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  btnText: { fontSize: 13, fontFamily: fonts.medium, color: ink.primary },
  doneText: { color: accent.onAccent },
});
