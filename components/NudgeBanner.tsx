import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import type { PendingNudge } from '../lib/notifications/pending';
import { friendlyAgo, gentleLate, possessive, pottyBreakPhrase } from '../lib/petVoice';
import { space } from '../theme/colors';
import { Banner, Button } from './ui';

/** Friendly lateness for a nudge: "due now" / "a little late" (never "overdue"). */
export function nudgeLateness(overdueBy: number): string {
  if (overdueBy < 60 * 1000) return 'due now';
  return gentleLate(Math.round(overdueBy / (60 * 1000)));
}

/** What the "Yes" button says for each nudge kind, in the owner's words. */
function yesLabel(nudge: PendingNudge): string {
  if (nudge.kind === 'meal') return 'Yes, fed';
  if (nudge.kind === 'medication') return 'Yes, given';
  return `Yes, ${nudge.petName} went`;
}

/**
 * The Yes / Not yet / Snooze control used by the Notification Center
 * (`app/notifications.tsx`). A big full-width "Yes" is the obvious answer; "Not
 * yet" and "Snooze" sit side by side underneath as quieter 48px buttons. The
 * handlers are the SAME shared action logic (`logYes` / `snoozeNudge`) the
 * headless push handler uses — only the look changed.
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
      <Button
        label={yesLabel(nudge)}
        icon="check"
        size="md"
        fullWidth
        onPress={() => onYes(nudge)}
        accessibilityLabel={`Yes, log ${nudge.subtitle} for ${nudge.petName}`}
      />
      <View style={styles.secondaryRow}>
        <Button
          label="Not yet"
          variant="secondary"
          size="md"
          onPress={() => onNotYet(nudge)}
          accessibilityLabel={`Not yet — re-ask about ${nudge.petName} in 20 minutes`}
          style={styles.half}
        />
        <Button
          label="Snooze 15 min"
          icon="clock"
          variant="secondary"
          size="md"
          onPress={() => onSnooze(nudge)}
          accessibilityLabel={`Snooze ${nudge.petName}'s reminder 15 minutes`}
          style={styles.half}
        />
      </View>
    </View>
  );
}

/**
 * In-app nudge for the active pet, computed from PREDICTION data (petSchedule) — so it appears even
 * if the push was suppressed in the foreground, missed, or permission was denied. On Home it is a
 * gentle amber Banner above the quick-log tiles: "Mochi's potty walk is a little late". Logging via
 * the tiles below is the "yes" answer (writing a log clears the prediction), so the banner carries
 * only the status + a Snooze. Meals stay with {@link MealTimeBanner}; this covers pee/poo breaks and
 * medications. Renders nothing when nothing is due. Snooze runs the same shared snooze action.
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

  const late = nudgeLateness(nudge.overdueBy);
  const isMed = nudge.kind === 'medication';
  const title = isMed
    ? `${possessive(pet.name)} ${nudge.title} is ${late}`
    : `${possessive(pet.name)} ${pottyBreakPhrase(pet.species)} is ${late}`;
  // Keep the "how late" detail the old line showed ("2h overdue"), in gentle words.
  const dueWhen = nudge.overdueBy >= 60 * 1000 ? friendlyAgo(now.getTime() - nudge.overdueBy, now) : 'now';
  const body = isMed
    ? `${nudge.subtitle}. Due ${dueWhen}.`
    : `${nudge.subtitle} was due ${dueWhen}. Tap Pee or Poo below once ${pet.name} has gone.`;

  return (
    <Banner
      tone="attention"
      icon={isMed ? 'pill' : 'clock'}
      title={title}
      body={body}
      secondaryAction={{
        label: 'Snooze 15 min',
        accessibilityLabel: `Snooze ${possessive(pet.name)} reminder for 15 minutes`,
        onPress: () => {
          onSnooze(nudge);
          setDismissed((prev) => new Set(prev).add(nudge.key));
        },
      }}
      style={styles.banner}
    />
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: space.sm },
  actions: { gap: space.xs },
  secondaryRow: { flexDirection: 'row', gap: space.xs },
  half: { flex: 1 },
});
