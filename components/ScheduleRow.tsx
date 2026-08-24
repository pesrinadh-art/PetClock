import { Pressable, StyleSheet, Text, View } from 'react-native';
import { surface, green, ink, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { formatClock } from '../lib/petSchedule';
import type { ScheduleRowItem } from '../lib/petSchedule';

/**
 * Legacy meal/med row. The meal-logging UI now lives inline on the pet profile
 * (built from the `ui/` primitives); this component is retained only for the
 * hidden/retired Food tab and keeps the same props so that screen still
 * compiles. Reskinned to the redesign tokens for visual consistency.
 */
export function ScheduleRow({
  item,
  accent,
  accentLight,
  onLogNow,
  logAccessibilityLabel,
}: {
  item: ScheduleRowItem;
  accent: string;
  accentLight: string;
  /**
   * One-tap logging for rows that aren't done yet — the badge becomes a tappable "Mark done"
   * button on both 'due' and 'upcoming' rows. Once a covering log lands the row flips to "✓ Done".
   */
  onLogNow?: () => void;
  /** aria-label for the mark-done control, e.g. "Mark Dinner as fed for Biscuit". */
  logAccessibilityLabel?: string;
}) {
  const done = item.status === 'done';
  const due = item.status === 'due';
  const canLog = !done && !!onLogNow;
  const badgeBg = done ? green.tint : due ? accent : accentLight;
  const badgeColor = done ? green.primary : due ? ink.onDark : accent;
  const badgeLabel = done ? '✓ Done' : due ? 'Due' : formatClock(item.time);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: accentLight }]}>
        <Text style={{ fontSize: 18 }}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.sub}>Scheduled {formatClock(item.time)}</Text>
      </View>
      {canLog ? (
        <Pressable
          style={({ pressed }) => [styles.badge, styles.logBadge, { backgroundColor: accent }, pressed && styles.badgePressed]}
          onPress={onLogNow}
          role="button"
          aria-label={logAccessibilityLabel ?? `Mark ${item.name} as done`}
          hitSlop={6}
        >
          <Text numberOfLines={1} style={[styles.badgeText, { color: ink.onDark }]}>Mark done</Text>
        </Pressable>
      ) : (
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text numberOfLines={1} style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 8,
    ...shadow.card,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  sub: { fontSize: 11, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  badge: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill, flexShrink: 0 },
  logBadge: { paddingVertical: 7, paddingHorizontal: 12 },
  badgePressed: { opacity: 0.8 },
  badgeText: { fontSize: 11, fontFamily: fonts.bold },
});
