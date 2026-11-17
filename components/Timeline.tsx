import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { category, green, ink, line, logTint, radius, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { FeedTime, LogEntry, LogType } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { describeLog, formatClock } from '../lib/petSchedule';
import { Card } from './ui';
import { Icon, type IconName } from './Icon';

/** Drawn-icon + tint per log type (replaces the emoji dots). */
const TYPE_STYLE: Record<LogType, { icon: IconName; bg: string; fg: string }> = {
  pee: { icon: 'drop', bg: logTint.peeBg, fg: logTint.peeInk },
  poo: { icon: 'poo', bg: logTint.pooBg, fg: logTint.pooInk },
  food: { icon: 'bowl', bg: terracotta.tint, fg: terracotta.primary },
  medication: { icon: 'pill', bg: category.medBg, fg: category.medInk },
  vet: { icon: 'vet', bg: category.vetBg, fg: category.vetInk },
  other: { icon: 'paw', bg: green.tint, fg: green.primary },
};

/** "by you" / "by a caregiver" — attribution derived from the log's author id. */
function caregiverLabel(createdBy: string | null, currentUserId?: string | null): string {
  if (!createdBy || createdBy === currentUserId) return 'you';
  return 'a caregiver';
}

export function Timeline({
  entries,
  feedTimes = [],
  now,
  currentUserId,
}: {
  entries: LogEntry[];
  /** The pet's feed times, so food logs resolve to their meal-slot name (Δ3). */
  feedTimes?: FeedTime[];
  now: Date;
  /** Current user id, so a log they authored reads "by you" and others "by a caregiver". */
  currentUserId?: string | null;
}) {
  const { removeLog, adjustLogTime } = useLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Logs are immutable server-side, so a time change is a replace (insert-new +
  // soft-delete-old) handled in LogsContext; see adjustLogTime.
  const adjustTime = (entry: LogEntry, deltaMinutes: number) => {
    adjustLogTime(entry.id, deltaMinutes);
  };

  if (entries.length === 0) return null;

  return (
    <Card style={styles.card}>
      {entries.map((e, i) => {
        const expanded = expandedId === e.id;
        const { label } = describeLog(e, feedTimes, now);
        const ts = TYPE_STYLE[e.type] ?? TYPE_STYLE.other;
        const occurredMs = new Date(e.occurredAt).getTime();
        const last = i === entries.length - 1;
        return (
          <View key={e.id}>
            <Pressable
              role="button"
              aria-label={`${label}, by ${caregiverLabel(e.createdBy, currentUserId)}, ${formatClock(new Date(occurredMs))}. Tap to edit or delete.`}
              style={styles.item}
              onPress={() => setExpandedId(expanded ? null : e.id)}
            >
              <View style={[styles.tile, { backgroundColor: ts.bg }]}>
                <Icon name={ts.icon} size={14} color={ts.fg} strokeWidth={2} />
              </View>
              <View style={styles.text}>
                <Text style={styles.label} numberOfLines={1}>{label}</Text>
                <Text style={styles.sub} numberOfLines={1}>by {caregiverLabel(e.createdBy, currentUserId)}</Text>
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
            {!last && !expanded && <View style={styles.divider} />}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  tile: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1 },
  label: { fontSize: 13.5, fontFamily: fonts.bold, color: ink.primary },
  sub: { fontSize: 11.5, fontFamily: fonts.medium, color: ink.faint2, marginTop: 1 },
  time: { fontSize: 12, fontFamily: fonts.bold, color: ink.muted },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 16 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.iconTile,
    backgroundColor: green.tint,
    alignItems: 'center',
  },
  actionText: { fontSize: 12, fontFamily: fonts.bold, color: green.primary },
  deleteBtn: { backgroundColor: terracotta.tint },
  deleteText: { color: terracotta.primary },
});
