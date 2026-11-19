import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import { nudgeLineIcon, type PendingNudge } from '../lib/notifications/pending';
import { formatAgo } from '../lib/formatAgo';
import { formatClock } from '../lib/petSchedule';
import { gentleLate } from '../lib/petVoice';
import { glass, ink, radius, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/** The "Yes" label per nudge kind: "Yes, fed" / "Yes, given" / "Yes, Luna went". */
function yesLabel(nudge: PendingNudge): string {
  if (nudge.kind === 'meal') return 'Yes, fed';
  if (nudge.kind === 'medication') return 'Yes, given';
  return `Yes, ${nudge.petName} went`;
}

/**
 * The Yes / Not yet / Snooze control (design v2 `.banner-actions`): a solid ink "Yes, …" pill
 * beside two glass pills, wrapping onto a second line when the labels don't fit. Shared by the
 * Home nudge banner and the Notification Center so an in-app answer looks and behaves the same
 * everywhere. The handlers it calls are the SAME shared action logic (`logYes` / `snoozeNudge`)
 * the headless push handler uses.
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
        <Icon name="check" size={15} color={ink.onDark} strokeWidth={2.2} />
        <Text numberOfLines={1} style={[styles.btnText, styles.yesBtnText]}>
          {yesLabel(nudge)}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        onPress={() => onNotYet(nudge)}
        role="button"
        aria-label={`Not yet — re-ask about ${nudge.petName} in 20 minutes`}
      >
        <Text numberOfLines={1} style={styles.btnText}>
          Not yet
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        onPress={() => onSnooze(nudge)}
        role="button"
        aria-label={`Snooze ${nudge.petName}'s reminder 15 minutes`}
      >
        <Icon name="clock" size={15} color={ink.primary} strokeWidth={1.8} />
        <Text numberOfLines={1} style={styles.btnText}>
          Snooze 15 min
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * In-app nudge for the active pet, computed from PREDICTION data (petSchedule) — so it appears even
 * if the push was suppressed in the foreground, missed, or permission was denied. On Home it sits
 * directly under the hero as a warm "a little late" banner (design v2 `.banner.warn`): the break
 * (or med) and how late it is, a mono "Due 2:00 PM · 20m ago" line, and the shared
 * Yes / Not yet / Snooze answers. Meals stay with {@link MealTimeBanner}. Renders nothing when
 * nothing is due.
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

  // Hide the answered banner right away; the hook re-derives once the log / snooze lands.
  const answer = (handler: (n: PendingNudge) => void) => (n: PendingNudge) => {
    handler(n);
    setDismissed((prev) => new Set(prev).add(n.key));
  };

  const late = gentleLate(Math.floor(nudge.overdueBy / 60_000));
  const isMed = nudge.kind === 'medication';
  const heading = `${isMed ? nudge.title : nudge.subtitle} · ${late}`;
  const due = new Date(now.getTime() - nudge.overdueBy);
  const question = isMed ? nudge.subtitle : nudge.title;

  return (
    <View style={styles.banner}>
      <View style={styles.top}>
        <Icon name={nudgeLineIcon(nudge)} size={18} color={warn.ink} strokeWidth={1.8} />
        <View style={styles.topText}>
          <Text style={styles.title} numberOfLines={2}>
            {heading}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            Due {formatClock(due)} · {formatAgo(nudge.overdueBy)} · {question}
          </Text>
        </View>
      </View>
      <View style={styles.bannerActions}>
        <NudgeActionButtons
          nudge={nudge}
          onYes={answer(onYes)}
          onNotYet={answer(onNotYet)}
          onSnooze={answer(onSnooze)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Home warn banner.
  banner: {
    marginTop: 10,
    padding: 14,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: warn.line,
    backgroundColor: warn.soft,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  topText: { flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary, lineHeight: 18 },
  sub: { fontSize: 11.5, fontFamily: fonts.monoRegular, color: ink.muted, marginTop: 3, lineHeight: 16 },
  bannerActions: { marginTop: 12 },

  // Shared Yes / Not yet / Snooze control (Home banner + Notification Center).
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  btn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
  },
  yesBtn: { backgroundColor: ink.primary, borderColor: 'transparent' },
  btnText: { fontSize: 13, fontFamily: fonts.medium, color: ink.primary },
  yesBtnText: { color: ink.onDark },
});
