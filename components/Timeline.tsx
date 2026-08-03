import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { FeedTime, LogEntry, LogType } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { describeLog, formatClock } from '../lib/petSchedule';

const DOT_BG: Record<LogType, string> = {
  pee: '#FFF8DB',
  poo: '#FBF0EA',
  food: colors.foodLight,
  medication: colors.medicineLight,
  vet: colors.apptVetLight,
  other: colors.sagePale,
};

const MINUTE_MS = 60 * 1000;

function formatRelative(timestamp: number, now: Date): string {
  const mins = Math.floor((now.getTime() - timestamp) / MINUTE_MS);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function Timeline({
  entries,
  feedTimes = [],
  now,
}: {
  entries: LogEntry[];
  /** The pet's feed times, so food logs resolve to their meal-slot name (Δ3). */
  feedTimes?: FeedTime[];
  now: Date;
}) {
  const { removeLog, adjustLogTime } = useLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Logs are immutable server-side, so a time change is a replace (insert-new +
  // soft-delete-old) handled in LogsContext; see adjustLogTime.
  const adjustTime = (entry: LogEntry, deltaMinutes: number) => {
    adjustLogTime(entry.id, deltaMinutes);
  };

  return (
    <View style={styles.list}>
      {entries.map((e) => {
        const expanded = expandedId === e.id;
        const { icon, label } = describeLog(e, feedTimes, now);
        const occurredMs = new Date(e.occurredAt).getTime();
        return (
          <View key={e.id} style={styles.card}>
            <Pressable
              role="button"
              aria-label={`${label}, ${formatRelative(occurredMs, now)}. Tap to edit or delete.`}
              style={styles.item}
              onPress={() => setExpandedId(expanded ? null : e.id)}
            >
              <View style={[styles.dot, { backgroundColor: DOT_BG[e.type] ?? colors.sagePale }]}>
                <Text style={{ fontSize: 16 }}>{icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.sub}>{formatRelative(occurredMs, now)}</Text>
              </View>
              <Text style={styles.time}>{formatClock(new Date(occurredMs))}</Text>
            </Pressable>
            {expanded && (
              <View style={styles.actions}>
                <Pressable
                  role="button"
                  aria-label="Move this log 15 minutes earlier"
                  style={styles.actionBtn}
                  onPress={() => adjustTime(e, -15)}
                >
                  <Text style={styles.actionText}>−15 min</Text>
                </Pressable>
                <Pressable
                  role="button"
                  aria-label="Move this log 15 minutes later"
                  style={styles.actionBtn}
                  onPress={() => adjustTime(e, 15)}
                >
                  <Text style={styles.actionText}>+15 min</Text>
                </Pressable>
                <Pressable
                  role="button"
                  aria-label={`Delete ${label} log`}
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => {
                    setExpandedId(null);
                    removeLog(e.id);
                  }}
                >
                  <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginBottom: 12 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    marginBottom: 7,
    ...shadow.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dot: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontFamily: fonts.bold, color: colors.stone },
  sub: { fontSize: 11, color: colors.stoneMid, marginTop: 1 },
  time: { fontFamily: fonts.mono, fontSize: 12, color: colors.stoneMid, marginLeft: 'auto' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.sagePale,
    alignItems: 'center',
  },
  actionText: { fontSize: 12, fontFamily: fonts.bold, color: colors.sage },
  deleteBtn: { backgroundColor: '#FBEAE8' },
  deleteText: { color: '#C0392B' },
});
