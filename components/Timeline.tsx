import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, danger, glass, ink, line, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { FeedTime, LogEntry } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { describeLog, formatClock } from '../lib/petSchedule';
import { Card } from './ui';
import { Icon } from './Icon';
import { presentLogType, type LogTypePresentation } from '../lib/care/logTypes';

/**
 * Drawn-icon + tint per log type come from the shared table (lib/care/logTypes). The Timeline
 * draws its other/unknown row as a paw on the accent tint, as it always has.
 */
const TIMELINE_OTHER: LogTypePresentation = { icon: 'paw', label: 'Log', bg: accent.soft, fg: accent.ink };

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
        const ts = presentLogType(e.type, TIMELINE_OTHER);
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
                <Icon name={ts.icon} size={16} color={ts.fg} strokeWidth={1.8} />
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
  // Design v2 diary row: 34px accent-soft tile · title + subtitle · mono time on the right.
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tile: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  sub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  time: { fontSize: 12, fontFamily: fonts.monoRegular, color: ink.muted, flexShrink: 0 },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 14 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 12.5, fontFamily: fonts.mono, color: ink.primary },
  deleteBtn: { backgroundColor: 'transparent', borderColor: danger.primary },
  deleteText: { fontFamily: fonts.medium, color: danger.primary },
});