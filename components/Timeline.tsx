import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ink, line, space, surface, tap } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import type { FeedTime, LogEntry } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { describeLog, formatClock } from '../lib/petSchedule';
import { Button, Card, IconTile } from './ui';
import { Icon } from './Icon';
import { logVisual } from './pets/logVisual';

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
        const v = logVisual(e.type);
        const occurredMs = new Date(e.occurredAt).getTime();
        const time = formatClock(new Date(occurredMs));
        const who = caregiverLabel(e.createdBy, currentUserId);
        const last = i === entries.length - 1;
        return (
          <View key={e.id} style={expanded ? styles.expandedWrap : undefined}>
            <Pressable
              role="button"
              aria-label={`${label}, by ${who}, ${time}. ${expanded ? 'Close options' : 'Tap to adjust or delete.'}`}
              aria-expanded={expanded}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              onPress={() => setExpandedId(expanded ? null : e.id)}
            >
              <IconTile icon={v.icon} tone={v.tone} size={38} />
              <View style={styles.text}>
                <Text style={styles.label} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  Logged by {who}
                </Text>
              </View>
              <Text style={styles.time}>{time}</Text>
              <Icon
                name={expanded ? 'close' : 'dots'}
                size={16}
                color={ink.placeholder}
                strokeWidth={2.2}
              />
            </Pressable>
            {expanded && (
              <View style={styles.actions}>
                <Text style={styles.actionsHint}>Adjust the time, or remove this entry.</Text>
                <View style={styles.actionRow}>
                  <Button
                    label="15 min earlier"
                    variant="soft"
                    size="md"
                    accessibilityLabel="Move this log 15 minutes earlier"
                    onPress={() => adjustTime(e, -15)}
                    style={styles.actionBtn}
                  />
                  <Button
                    label="15 min later"
                    variant="soft"
                    size="md"
                    accessibilityLabel="Move this log 15 minutes later"
                    onPress={() => adjustTime(e, 15)}
                    style={styles.actionBtn}
                  />
                </View>
                <Button
                  label="Delete entry"
                  icon="trash"
                  variant="secondary"
                  tone="neutral"
                  size="md"
                  fullWidth
                  accessibilityLabel={`Delete ${label} log`}
                  onPress={() => {
                    setExpandedId(null);
                    removeLog(e.id);
                  }}
                />
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
  card: { marginBottom: space.sm },
  expandedWrap: { backgroundColor: surface.field },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 60,
    paddingVertical: space.xs,
    paddingHorizontal: space.lg,
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0 },
  label: { ...type.subhead, color: ink.primary },
  sub: { ...type.caption, color: ink.muted, marginTop: 1 },
  time: { ...type.caption, fontFamily: fonts.bold, color: ink.muted },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: space.lg },
  actions: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.xs },
  actionsHint: { ...type.caption, color: ink.muted },
  actionRow: { flexDirection: 'row', gap: space.xs, minHeight: tap.min },
  actionBtn: { flex: 1, paddingHorizontal: 10 },
});
