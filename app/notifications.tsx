import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NudgeActionButtons } from '../components/NudgeBanner';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import type { PendingKind, PendingNudge } from '../lib/notifications/pending';
import { listScheduledSummaries, type ScheduledSummary } from '../lib/notifications/scheduler';
import { repos } from '../lib/repo/types';
import { formatClock, formatTimeUntil } from '../lib/petSchedule';
import { formatAgo } from '../lib/formatAgo';
import { amber, green, ink, line, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from '../components/Icon';
import { PetAvatar } from '../components/PetAvatar';
import { SectionLabel } from '../components/ui';

const KIND_ICON: Record<PendingKind, IconName> = { meal: 'bowl', medication: 'pill', break: 'paw' };
/** A nudge this far past due reads "Running late". */
const LATE_MS = 15 * 60 * 1000;

/** "2:15 PM" for today, else "Mon 2:15 PM" — a human "when" for a scheduled reminder. */
function whenLabel(fireAt: Date, now: Date): string {
  const sameDay = fireAt.toDateString() === now.toDateString();
  const clock = formatClock(fireAt);
  if (sameDay) return clock;
  const day = fireAt.toLocaleDateString([], { weekday: 'short' });
  return `${day} ${clock}`;
}

/**
 * Notification Center — two lists:
 *   (a) "Needs your answer": currently-due nudges derived from PREDICTION data (petSchedule),
 *       answerable with the same shared Yes / Not yet / Snooze actions the push handler uses. This
 *       is the always-available surface (works on web and without notification permission).
 *   (b) "Upcoming reminders": the OS's already-scheduled notifications (native only, guarded via
 *       `safe`). On web / without permission this section is simply empty and (a) stands alone.
 */
export default function NotificationsScreen() {
  const { pets } = usePets();
  const { logs } = useLogs();
  const { items: feedTimes } = usePersistedCollection(repos.feedTimes);
  const { items: medications } = usePersistedCollection(repos.medications);
  const now = useNow();

  const { nudges, onYes, onNotYet, onSnooze } = usePendingNudges(
    pets,
    feedTimes,
    medications,
    logs,
    now,
  );

  // Scheduled OS notifications (native only; [] on web). Refresh on mount, on foreground, and as
  // time ticks so a just-answered/re-armed reminder shows up.
  const [scheduled, setScheduled] = useState<ScheduledSummary[]>([]);
  useEffect(() => {
    let live = true;
    const pull = () => {
      listScheduledSummaries().then((s) => {
        if (live) setScheduled(s);
      });
    };
    pull();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') pull();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [now]);

  const hasContent = nudges.length > 0 || scheduled.length > 0;

  // Group the due nudges by pet, keeping the (most-urgent-first) order of the first appearance.
  const groups: { petId: string; items: PendingNudge[] }[] = [];
  for (const n of nudges) {
    const g = groups.find((x) => x.petId === n.petId);
    if (g) g.items.push(n);
    else groups.push({ petId: n.petId, items: [n] });
  }

  const subtitle =
    nudges.length === 0
      ? 'Nothing needs an answer'
      : `${nudges.length} ${nudges.length === 1 ? 'thing needs' : 'things need'} a quick answer`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          role="button"
          aria-label="Close notifications"
          hitSlop={8}
        >
          <Icon name="close" size={18} color={ink.primary} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
      </View>

      {!hasContent ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="bell" size={26} color={green.primary} strokeWidth={1.9} />
          </View>
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptyBody}>
            Reminders for potty breaks, meals, and appointments will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {groups.length > 0 && (
            <>
              <SectionLabel sub="Answer here and we'll update the next reminder.">Needs your answer</SectionLabel>
              {groups.map((group) => {
                const pet = pets.find((p) => p.id === group.petId);
                return (
                  <View key={group.petId} style={styles.group}>
                    <View style={styles.petRow}>
                      {pet && <PetAvatar pet={pet} size={40} emojiSize={21} style={styles.petAvatar} />}
                      <Text style={styles.petName}>{pet?.name ?? group.items[0].petName}</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countText}>{group.items.length}</Text>
                      </View>
                    </View>
                    {group.items.map((nudge) => (
                      <View key={nudge.key} style={styles.card}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardIcon}>
                            <Icon name={KIND_ICON[nudge.kind]} size={20} color={amber.warnInk} strokeWidth={2} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{nudge.title}</Text>
                            <Text style={styles.cardSub}>
                              {nudge.subtitle} · due {nudge.overdueBy < 60_000 ? 'now' : formatAgo(nudge.overdueBy)}
                            </Text>
                          </View>
                          {nudge.overdueBy >= LATE_MS && (
                            <View style={styles.latePill}>
                              <Icon name="clock" size={13} color={amber.warnInk} strokeWidth={2.2} />
                              <Text style={styles.lateText}>Running late</Text>
                            </View>
                          )}
                        </View>
                        <NudgeActionButtons
                          nudge={nudge}
                          onYes={onYes}
                          onNotYet={onNotYet}
                          onSnooze={onSnooze}
                        />
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}

          {scheduled.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: 14 }}>Upcoming reminders</SectionLabel>
              {scheduled.map((s) => (
                <View key={s.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{s.title}</Text>
                    {!!s.body && <Text style={styles.rowSub}>{s.body}</Text>}
                  </View>
                  <View style={styles.whenBadge}>
                    <Text style={styles.whenText}>{whenLabel(s.fireAt, now)}</Text>
                    <Text style={styles.whenSub}>{formatTimeUntil(s.fireAt, now)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 18,
  },
  title: { fontSize: 23, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.6 },
  headerSub: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 1 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },

  group: { marginBottom: 8 },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 },
  petAvatar: { borderWidth: 2, borderColor: '#ffffff' },
  petName: { fontSize: 15, fontFamily: fonts.bold, color: ink.primary },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 11.5, fontFamily: fonts.bold, color: ink.muted },

  card: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 12,
    ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.iconTile,
    backgroundColor: amber.warnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15.5, fontFamily: fonts.bold, color: ink.primary, marginBottom: 2 },
  cardSub: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted, lineHeight: 17 },
  latePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: amber.warnBg,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  lateText: { fontSize: 11.5, fontFamily: fonts.bold, color: amber.warnInk },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  rowTitle: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  rowSub: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  whenBadge: { alignItems: 'flex-end' },
  whenText: { fontSize: 12.5, fontFamily: fonts.bold, color: ink.primary },
  whenSub: { fontSize: 11.5, color: ink.muted, marginTop: 2 },

  // No negative marginTop: it would pull this full-height view up over the title row and (on web)
  // swallow taps on the ✕ close button — which is exactly why closing failed only when empty.
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontFamily: fonts.extraBold, color: ink.primary },
  emptyBody: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center', lineHeight: 19 },
});
