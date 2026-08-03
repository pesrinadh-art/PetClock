import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import { formatOverdue, type PendingNudge } from '../lib/notifications/pending';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';

/**
 * The ✅ Yes / ❌ Not yet / ⏰ Snooze control — shared verbatim by the NudgeBanner and the
 * Notification Center so an in-app answer looks and behaves the same everywhere. The handlers it
 * calls are the SAME shared action logic (`logYes` / `snoozeNudge`) the headless push handler uses.
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
        <Text style={styles.yesBtnText}>✅ Yes</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => onNotYet(nudge)}
        role="button"
        aria-label={`Not yet — re-ask about ${nudge.petName} in 20 minutes`}
      >
        <Text style={styles.secondaryBtnText}>❌ Not yet</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => onSnooze(nudge)}
        role="button"
        aria-label={`Snooze ${nudge.petName}'s reminder 15 minutes`}
      >
        <Text style={styles.secondaryBtnText}>⏰ Snooze</Text>
      </Pressable>
    </View>
  );
}

/**
 * In-app nudge for the active pet, computed from PREDICTION data (petSchedule) rather than the OS
 * notification — so it appears even if the push was suppressed in the foreground, missed, or
 * notification permission was denied. Answering it runs the exact same shared action logic a
 * lock-screen tap runs. Meals are intentionally left to the dedicated {@link MealTimeBanner} on
 * Home (no duplication); this covers the flagship pee/poo break plus medications, which have no
 * other in-app banner. Renders nothing when nothing is due. Works on web (prediction is local).
 */
export function NudgeBanner({ pet }: { pet: Pet }) {
  const { getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();
  const { nudges, onYes, onNotYet, onSnooze } = usePendingNudges(
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
    <View style={styles.banner}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{nudge.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{nudge.title}</Text>
          <Text style={styles.body}>
            {nudge.subtitle} · {formatOverdue(nudge.overdueBy)}
          </Text>
        </View>
      </View>
      <NudgeActionButtons nudge={nudge} onYes={onYes} onNotYet={onNotYet} onSnooze={onSnooze} />
      {/* Rendered last so it paints on top of headerRow; on react-native-web an earlier
          sibling View would otherwise capture taps over the close button. */}
      <Pressable
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        onPress={() => setDismissed((prev) => new Set(prev).add(nudge.key))}
        role="button"
        aria-label="Dismiss reminder"
        hitSlop={8}
      >
        <Text style={styles.dismissText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1.5,
    borderColor: colors.sageLight,
    backgroundColor: colors.sagePale,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 16,
    ...shadow.sm,
  },
  dismiss: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dismissText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stoneMid },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: 24, marginBottom: 12 },
  icon: { fontSize: 22 },
  title: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 2 },
  body: { fontSize: 12, color: colors.stoneMid },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  pressed: { opacity: 0.8 },
  yesBtn: { backgroundColor: colors.sage },
  yesBtnText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.white },
  secondaryBtn: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.stoneLight },
  secondaryBtnText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.stoneMid },
});
