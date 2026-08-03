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
import { formatOverdue } from '../lib/notifications/pending';
import { listScheduledSummaries, type ScheduledSummary } from '../lib/notifications/scheduler';
import { repos } from '../lib/repo/types';
import { formatClock, formatTimeUntil } from '../lib/petSchedule';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.titleRow}>
        <View style={{ width: 32 }} />
        <Text style={styles.title}>Notifications</Text>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          role="button"
          aria-label="Close notifications"
          hitSlop={8}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {!hasContent ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptyBody}>
            Reminders for potty breaks, meals, and appointments will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {nudges.length > 0 && (
            <>
              <Text style={styles.section}>Needs your answer</Text>
              {nudges.map((nudge) => (
                <View key={nudge.key} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardIcon}>{nudge.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {nudge.petName} · {nudge.title}
                      </Text>
                      <Text style={styles.cardSub}>
                        {nudge.subtitle} · {formatOverdue(nudge.overdueBy)}
                      </Text>
                    </View>
                  </View>
                  <NudgeActionButtons
                    nudge={nudge}
                    onYes={onYes}
                    onNotYet={onNotYet}
                    onSnooze={onSnooze}
                  />
                </View>
              ))}
            </>
          )}

          {scheduled.length > 0 && (
            <>
              <Text style={styles.section}>Upcoming reminders</Text>
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
  safe: { flex: 1, backgroundColor: colors.cream },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontFamily: fonts.black, color: colors.stone, textAlign: 'center', flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stoneMid },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  section: {
    fontSize: 12,
    fontFamily: fonts.extraBold,
    color: colors.stoneMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },

  card: {
    backgroundColor: colors.sagePale,
    borderWidth: 1.5,
    borderColor: colors.sageLight,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 10,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  cardIcon: { fontSize: 22 },
  cardTitle: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 2 },
  cardSub: { fontSize: 12, color: colors.stoneMid },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  rowTitle: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  rowSub: { fontSize: 12, color: colors.stoneMid, marginTop: 2 },
  whenBadge: { alignItems: 'flex-end' },
  whenText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.stone },
  whenSub: { fontSize: 11, color: colors.stoneMid, marginTop: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8, marginTop: -40 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone },
  emptyBody: { fontSize: 13, color: colors.stoneMid, textAlign: 'center', lineHeight: 19 },
});
