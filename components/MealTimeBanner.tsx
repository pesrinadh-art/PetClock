import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ink, radius, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { nudgeKey, useNudges } from '../context/NudgesContext';
import { getTodaysMeals } from '../lib/petSchedule';
import { Card } from './ui';
import { Icon } from './Icon';

const SNOOZE_MS = 30 * 60 * 1000;

/**
 * The meal "attention" card (screen 2a): a white card with a terracotta left
 * border — a bowl icon tile, "<Meal> time", "Tell us once <pet> has eaten", and a
 * terracotta "Done" button. It prompts for exactly one meal at a time — whichever
 * is actually due right now — so there's no way to mark a later meal done early.
 * "Done" logs the slot by feedTimeId (Δ1); a subtle "Snooze" defers it 30 min.
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
    <Card padded style={styles.card}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Icon name="bowl" size={16} color={terracotta.primary} strokeWidth={2} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>{dueMeal.name} time</Text>
          <Text style={styles.sub} numberOfLines={1}>Tell us once {pet.name} has eaten</Text>
        </View>
        <Pressable
          onPress={handleSnooze}
          role="button"
          aria-label="Remind me in 30 minutes"
          hitSlop={8}
        >
          <Text style={styles.snooze}>Snooze</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
          onPress={handleDoneFeeding}
          role="button"
          aria-label={`Log ${dueMeal.name} as fed for ${pet.name}`}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderLeftWidth: 4,
    borderLeftColor: terracotta.primary,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
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
  title: { fontSize: 14.5, fontFamily: fonts.bold, color: ink.primary },
  sub: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 1 },
  snooze: { fontSize: 11.5, fontFamily: fonts.semiBold, color: ink.faint2 },
  doneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.iconTile,
    backgroundColor: terracotta.primary,
  },
  pressed: { opacity: 0.8 },
  doneText: { fontSize: 12.5, fontFamily: fonts.bold, color: '#ffffff' },
});
