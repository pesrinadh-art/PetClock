import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { TimelineEntry } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { formatClock } from '../lib/petSchedule';

const DOT_BG: Record<TimelineEntry['type'], string> = {
  pee: '#FFF8DB',
  poo: '#FBF0EA',
  food: colors.foodLight,
  vet: colors.apptVetLight,
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

export function Timeline({ entries, now }: { entries: TimelineEntry[]; now: Date }) {
  const { removeLog, updateLog } = useLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const adjustTime = (entry: TimelineEntry, deltaMinutes: number) => {
    const next = Math.min(entry.timestamp + deltaMinutes * MINUTE_MS, now.getTime());
    updateLog(entry.id, { timestamp: next });
  };

  return (
    <View style={styles.list}>
      {entries.map((e) => {
        const expanded = expandedId === e.id;
        return (
          <View key={e.id} style={styles.card}>
            <Pressable
              role="button"
              aria-label={`${e.label}, ${formatRelative(e.timestamp, now)}. Tap to edit or delete.`}
              style={styles.item}
              onPress={() => setExpandedId(expanded ? null : e.id)}
            >
              <View style={[styles.dot, { backgroundColor: DOT_BG[e.type] }]}>
                <Text style={{ fontSize: 16 }}>{e.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{e.label}</Text>
                <Text style={styles.sub}>{formatRelative(e.timestamp, now)}</Text>
              </View>
              <Text style={styles.time}>{formatClock(new Date(e.timestamp))}</Text>
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
                  aria-label={`Delete ${e.label} log`}
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
