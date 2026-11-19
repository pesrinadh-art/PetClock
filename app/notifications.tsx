import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import { NudgeActionButtons } from '../components/NudgeBanner';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import type { PendingKind, PendingNudge } from '../lib/notifications/pending';
import { careLogTypeFor } from '../lib/notifications/actions';
import { OTHER_LOG_PRESENTATION, presentLogType } from '../lib/care/logTypes';
import { listScheduledSummaries, type ScheduledSummary } from '../lib/notifications/scheduler';
import { repos } from '../lib/repo/types';
import { formatClock, formatTimeUntil } from '../lib/petSchedule';
import { formatAgo } from '../lib/formatAgo';
import { gentleLate } from '../lib/petVoice';
import { accent, glass, ink, radius, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from '../components/Icon';
import { PetAvatar } from '../components/PetAvatar';
import { Card, Screen, SectionLabel } from '../components/ui';

const KIND_ICON: Record<PendingKind, IconName> = { meal: 'bowl', medication: 'pill', break: 'paw' };

/**
 * The card icon for a nudge. A care_due payload (walks / habitat cleaning) draws its module's
 * log-type icon via the care presentation table; every other kind keeps its KIND_ICON glyph, and
 * anything this build does not know falls back to the shared other/unknown row.
 */
function nudgeCardIcon(nudge: PendingNudge): IconName {
  if (nudge.data?.kind === 'care_due') return presentLogType(careLogTypeFor(nudge.data.careModule) ?? 'unknown').icon;
  return KIND_ICON[nudge.kind] ?? OTHER_LOG_PRESENTATION.icon;
}
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
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          role="button"
          aria-label="Close notifications"
          hitSlop={8}
        >
          <Icon name="close" size={17} color={ink.primary} strokeWidth={1.8} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} role="heading">
            Notifications
          </Text>
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
      </View>

      {!hasContent ? (
        <View style={styles.empty}>
          <Card padded style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Icon name="bell" size={18} color={accent.ink} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyBody}>
              Reminders for potty breaks, meals, and appointments will show up here.
            </Text>
          </Card>
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
                      {pet && <PetAvatar pet={pet} size={32} emojiSize={17} style={styles.petAvatar} />}
                      <Text style={styles.petName}>{pet?.name ?? group.items[0].petName}</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countText}>{group.items.length}</Text>
                      </View>
                    </View>
                    {group.items.map((nudge) => {
                      const late = nudge.overdueBy >= LATE_MS;
                      return (
                        <Card key={nudge.key} padded style={[styles.card, late && styles.cardLate]}>
                          <View style={styles.cardHeader}>
                            <View style={[styles.cardIcon, late && styles.cardIconLate]}>
                              <Icon
                                name={nudgeCardIcon(nudge)}
                                size={18}
                                color={late ? warn.ink : accent.ink}
                                strokeWidth={1.8}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cardTitle}>{nudge.title}</Text>
                              <Text style={styles.cardSub}>
                                {nudge.subtitle} · due {nudge.overdueBy < 60_000 ? 'now' : formatAgo(nudge.overdueBy)}
                              </Text>
                            </View>
                            {late && (
                              <View style={styles.latePill}>
                                <Icon name="clock" size={12} color={warn.ink} strokeWidth={1.8} />
                                <Text style={styles.lateText}>
                                  {gentleLate(Math.floor(nudge.overdueBy / 60_000)).replace(/^./, (c) => c.toUpperCase())}
                                </Text>
                              </View>
                            )}
                          </View>
                          <NudgeActionButtons
                            nudge={nudge}
                            onYes={onYes}
                            onNotYet={onNotYet}
                            onSnooze={onSnooze}
                          />
                        </Card>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}

          {scheduled.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: 18 }}>Upcoming reminders</SectionLabel>
              <Card>
                {scheduled.map((s, i) => (
                  <View key={s.id} style={[styles.row, i < scheduled.length - 1 && styles.rowDivider]}>
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
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 18,
  },
  title: { fontSize: 22, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.7 },
  headerSub: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },

  group: { marginBottom: 8 },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 },
  petAvatar: { backgroundColor: accent.soft, borderWidth: 1, borderColor: accent.line },
  petName: { fontSize: 15, fontFamily: fonts.medium, letterSpacing: -0.25, color: ink.primary },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderColor: accent.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10.5, fontFamily: fonts.mono, color: accent.ink },

  card: { marginBottom: 10 },
  cardLate: { borderColor: warn.line },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconLate: { backgroundColor: warn.soft },
  cardTitle: { fontSize: 15, fontFamily: fonts.medium, letterSpacing: -0.2, color: ink.primary, marginBottom: 2 },
  cardSub: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 17 },
  latePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    backgroundColor: warn.soft,
    borderWidth: 1,
    borderColor: warn.line,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
  },
  lateText: { fontSize: 10.5, fontFamily: fonts.mono, color: warn.ink },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: glass.border },
  rowTitle: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  whenBadge: { alignItems: 'flex-end' },
  whenText: { fontSize: 13, fontFamily: fonts.mono, color: ink.primary },
  whenSub: { fontSize: 11, fontFamily: fonts.monoRegular, color: ink.muted, marginTop: 2 },

  // No negative marginTop: it would pull this full-height view up over the title row and (on web)
  // swallow taps on the ✕ close button — which is exactly why closing failed only when empty.
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 60 },
  emptyCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontFamily: fonts.medium, letterSpacing: -0.2, color: ink.primary, marginBottom: 4 },
  emptyBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center', lineHeight: 19.5 },
});