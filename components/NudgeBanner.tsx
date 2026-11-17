import { useState } from 'react';
import { possessive } from '../lib/petVoice';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import type { PendingNudge } from '../lib/notifications/pending';
import { gentleLate } from '../lib/petVoice';
import { amber, green, ink, line, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/** The "Yes" label per nudge kind: "Yes, fed" / "Yes, given" / "Yes, Luna went". */
function yesLabel(nudge: PendingNudge): string {
  if (nudge.kind === 'meal') return 'Yes, fed';
  if (nudge.kind === 'medication') return 'Yes, given';
  return `Yes, ${nudge.petName} went`;
}

/**
 * The Yes / Not yet / Snooze control (redesign v3): a full-width green "✓ Yes, …" button over
 * two outlined buttons. Shared by the Notification Center so an in-app answer looks and behaves
 * the same everywhere. The handlers it calls are the SAME shared action logic (`logYes` /
 * `snoozeNudge`) the headless push handler uses.
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
        style={({ pressed }) => [styles.yesBtn, pressed && styles.pressed]}
        onPress={() => onYes(nudge)}
        role="button"
        aria-label={`Yes, log ${nudge.subtitle} for ${nudge.petName}`}
      >
        <Icon name="check" size={17} color="#ffffff" strokeWidth={2.6} />
        <Text numberOfLines={1} style={styles.yesBtnText}>
          {yesLabel(nudge)}
        </Text>
      </Pressable>
      <View style={styles.secondaryRow}>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          onPress={() => onNotYet(nudge)}
          role="button"
          aria-label={`Not yet — re-ask about ${nudge.petName} in 20 minutes`}
        >
          <Text numberOfLines={1} style={styles.secondaryBtnText}>
            Not yet
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          onPress={() => onSnooze(nudge)}
          role="button"
          aria-label={`Snooze ${nudge.petName}'s reminder 15 minutes`}
        >
          <Icon name="clock" size={16} color={green.primary} strokeWidth={2.2} />
          <Text numberOfLines={1} style={styles.secondaryBtnText}>
            Snooze 15 min
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * In-app nudge for the active pet, computed from PREDICTION data (petSchedule) — so it appears even
 * if the push was suppressed in the foreground, missed, or permission was denied. On Home it sits
 * just above the quick-log tiles as an amber attention strip: "<pet> · <break> <overdue>" with a
 * Snooze affordance. Logging via the tiles is the "yes" answer (writing a log clears the
 * prediction). Meals stay with {@link MealTimeBanner}. Renders nothing when nothing is due.
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
    <View style={styles.banner}>
      <View style={styles.bannerIcon}>
        <Icon name={nudge.kind === 'medication' ? 'pill' : 'paw'} size={16} color={amber.warnInk} strokeWidth={2} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {pet.name} · {nudge.subtitle}{' '}
        <Text style={styles.accent}>{gentleLate(Math.floor(nudge.overdueBy / 60_000))}</Text>
      </Text>
      <Pressable
        onPress={() => {
          onSnooze(nudge);
          setDismissed((prev) => new Set(prev).add(nudge.key));
        }}
        role="button"
        aria-label={`Snooze ${possessive(pet.name)} reminder`}
        hitSlop={8}
      >
        <Text style={styles.snooze}>Snooze</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Home attention strip.
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: amber.warnBg,
    borderWidth: 1,
    borderColor: '#f3dfb9',
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 13, fontFamily: fonts.semiBold, color: ink.primary, lineHeight: 18 },
  accent: { color: amber.warnInk, fontFamily: fonts.bold },
  snooze: { fontSize: 13, fontFamily: fonts.bold, color: green.primary },

  // Shared Yes / Not yet / Snooze control (Notification Center).
  actions: { gap: 8 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  yesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: green.mid,
    borderRadius: radius.tile,
    paddingVertical: 13,
    ...shadow.sm,
  },
  yesBtnText: { fontSize: 14.5, fontFamily: fonts.bold, color: '#ffffff' },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: line.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
  },
  secondaryBtnText: { fontSize: 13.5, fontFamily: fonts.bold, color: green.primary },
});
