import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import { formatOverdue, type PendingNudge } from '../lib/notifications/pending';
import { green, ink, radius, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';

/**
 * The ✅ Yes / ❌ Not yet / ⏰ Snooze control — shared verbatim by the Notification Center
 * (`app/notifications.tsx`) so an in-app answer looks and behaves the same everywhere. The
 * handlers it calls are the SAME shared action logic (`logYes` / `snoozeNudge`) the headless push
 * handler uses. NOTE: this control is owned by the Notification Center's redesign; it is left as-is
 * here so that screen keeps compiling — the Home surface no longer renders it (see NudgeBanner).
 */
export function NudgeActionButtons({
  nudge,
  onYes,
  onNotYet,
  onSnooze,
}: {
  nudge: PendingNudge;
  onYes: (nudge: PendingNudge) => void;
  onNotYet: (nudge: PendingNudge) => void;
  onSnooze: (nudge: PendingNudge) => void;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        style={({ pressed }) => [styles.btn, styles.yesBtn, pressed && styles.pressed]}
        onPress={() => onYes(nudge)}
        role="button"
        aria-label={`Yes, log ${nudge.subtitle} for ${nudge.petName}`}
      >
        <Text numberOfLines={1} style={styles.yesBtnText}>✅ Yes</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => onNotYet(nudge)}
        role="button"
        aria-label={`Not yet — re-ask about ${nudge.petName} in 20 minutes`}
      >
        <Text numberOfLines={1} style={styles.secondaryBtnText}>❌ Not yet</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => onSnooze(nudge)}
        role="button"
        aria-label={`Snooze ${nudge.petName}'s reminder 15 minutes`}
      >
        <Text numberOfLines={1} style={styles.secondaryBtnText}>⏰ Snooze</Text>
      </Pressable>
    </View>
  );
}

/**
 * In-app nudge for the active pet, computed from PREDICTION data (petSchedule) — so it appears even
 * if the push was suppressed in the foreground, missed, or permission was denied. On Home (screen
 * 2a) it renders as the header line of the "Quick log" card: "<pet> · <break> <overdue>" with a
 * Snooze affordance. Logging via the quick-log tiles below is the "yes" answer (writing a log clears
 * the prediction), so this line carries only the status + Snooze. Meals stay with the dedicated
 * {@link MealTimeBanner} attention card; this covers the flagship pee/poo break plus medications.
 * Renders nothing when nothing is due. Snooze runs the same shared snooze action as before.
 */
export function NudgeBanner({ pet }: { pet: Pet }) {
  const { getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();
  const { nudges, onSnooze } = usePendingNudges(
    [pet],
    getFeedTimesForPet(pet.id),
    getMedicationsForPet(pet.id),
    getLogsForPet(pet.id),
    now,
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const nudge = nudges.find((n) => n.kind !== 'meal' && !dismissed.has(n.key));
  if (!nudge) return null;

  return (
    <View style={styles.header}>
      <Text style={styles.text} numberOfLines={1}>
        {pet.name} · {nudge.subtitle}{' '}
        <Text style={styles.accent}>{formatOverdue(nudge.overdueBy)}</Text>
      </Text>
      <Pressable
        onPress={() => {
          onSnooze(nudge);
          setDismissed((prev) => new Set(prev).add(nudge.key));
        }}
        role="button"
        aria-label={`Snooze ${pet.name}'s reminder`}
        hitSlop={8}
      >
        <Text style={styles.snooze}>Snooze</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Quick-log card header line.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 11,
  },
  text: { flex: 1, fontSize: 13, fontFamily: fonts.semiBold, color: ink.muted },
  accent: { color: terracotta.primary, fontFamily: fonts.bold },
  snooze: { fontSize: 11.5, fontFamily: fonts.semiBold, color: green.primary },

  // Shared Yes / Not yet / Snooze control (Notification Center) — unchanged.
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: radius.tile, paddingVertical: 10, alignItems: 'center' },
  pressed: { opacity: 0.8 },
  yesBtn: { backgroundColor: green.mid },
  yesBtnText: { fontSize: 12, fontFamily: fonts.extraBold, color: '#ffffff' },
  secondaryBtn: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e6ded0' },
  secondaryBtnText: { fontSize: 12, fontFamily: fonts.extraBold, color: ink.muted },
});
