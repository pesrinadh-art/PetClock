import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface, ink, radius, shadow, line } from '../../../theme/colors';
import { fonts } from '../../../theme/fonts';
import { Icon } from '../../../components/Icon';
import { usePets } from '../../../context/PetsContext';
import { useLogs } from '../../../context/LogsContext';
import { describeLog, formatClock } from '../../../lib/petSchedule';
import { useNow } from '../../../hooks/useNow';
import type { FeedTime, LogEntry } from '../../../lib/db/models';

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today" / "Yesterday" / "Mon, Jan 5" for a day bucket, relative to `now`. */
function dayLabel(dayMs: number, now: Date): string {
  const today = startOfDay(now.getTime());
  if (dayMs === today) return 'Today';
  if (dayMs === today - 24 * 60 * 60 * 1000) return 'Yesterday';
  const d = new Date(dayMs);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

type DayGroup = { dayMs: number; label: string; entries: LogEntry[] };

function groupByDay(logs: LogEntry[], feedTimes: FeedTime[], now: Date): DayGroup[] {
  const byDay = new Map<number, LogEntry[]>();
  for (const l of logs) {
    if (l.deletedAt) continue;
    const day = startOfDay(new Date(l.occurredAt).getTime());
    const list = byDay.get(day);
    if (list) list.push(l);
    else byDay.set(day, [l]);
  }
  // logs arrive newest-first; keep days descending and entries newest-first within a day.
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayMs, entries]) => ({ dayMs, label: dayLabel(dayMs, now), entries }));
}

export default function LogHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, getFeedTimesForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();

  const pet = pets.find((p) => p.id === id) ?? null;
  const feedTimes = pet ? getFeedTimesForPet(pet.id) : [];
  const logs = pet ? getLogsForPet(pet.id) : [];

  const groups = useMemo(() => groupByDay(logs, feedTimes, now), [logs, feedTimes, now]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pets'))}
          role="button"
          aria-label="Back"
          hitSlop={8}
        >
          <Icon name="chevronLeft" size={18} color={ink.muted} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{pet ? `${pet.name}'s history` : 'History'}</Text>
        <View style={{ width: 34 }} />
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="clock" size={40} color={ink.faint} />
          <Text style={styles.emptyTitle}>No logs yet</Text>
          <Text style={styles.emptyBody}>Logged potty breaks, meals and meds will appear here, grouped by day.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {groups.map((group) => (
            <View key={group.dayMs} style={styles.group}>
              <Text style={styles.dayHeader}>{group.label}</Text>
              {group.entries.map((entry) => {
                const { icon, label } = describeLog(entry, feedTimes, now);
                return (
                  <View key={entry.id} style={styles.row}>
                    <Text style={styles.rowIcon}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{label}</Text>
                      {!!entry.note && <Text style={styles.rowNote}>{entry.note}</Text>}
                    </View>
                    <Text style={styles.rowTime}>{formatClock(new Date(entry.occurredAt))}</Text>
                  </View>
                );
              })}
            </View>
          ))}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontFamily: fonts.extraBold, color: ink.primary, textAlign: 'center', flex: 1, letterSpacing: -0.4 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  group: { marginBottom: 18 },
  dayHeader: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: ink.faint,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 9,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
    ...shadow.card,
  },
  rowIcon: { fontSize: 20 },
  rowLabel: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  rowNote: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  rowTime: { fontSize: 12, fontFamily: fonts.semiBold, color: ink.faint2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary },
  emptyBody: { fontSize: 13, color: ink.muted, textAlign: 'center', lineHeight: 19 },
});
