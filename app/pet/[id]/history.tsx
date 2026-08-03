import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../../../theme/colors';
import { fonts } from '../../../theme/fonts';
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pets'))}
          role="button"
          aria-label="Back"
          hitSlop={8}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{pet ? `${pet.name}'s History` : 'History'}</Text>
        <View style={{ width: 32 }} />
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🗂️</Text>
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
  safe: { flex: 1, backgroundColor: colors.cream },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 8,
  },
  title: { fontSize: 20, fontFamily: fonts.black, color: colors.stone, textAlign: 'center', flex: 1 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 22, fontFamily: fonts.extraBold, color: colors.stoneMid, marginTop: -2 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  group: { marginBottom: 16 },
  dayHeader: {
    fontSize: 12,
    fontFamily: fonts.extraBold,
    color: colors.stoneMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
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
  rowIcon: { fontSize: 20 },
  rowLabel: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  rowNote: { fontSize: 12, color: colors.stoneMid, marginTop: 2 },
  rowTime: { fontSize: 12, fontFamily: fonts.mono, color: colors.stoneMid },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8, marginTop: -40 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone },
  emptyBody: { fontSize: 13, color: colors.stoneMid, textAlign: 'center', lineHeight: 19 },
});
