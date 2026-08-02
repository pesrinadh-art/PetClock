import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { formatClock } from '../lib/petSchedule';
import type { ScheduleRowItem } from '../lib/petSchedule';

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
  const badgeBg = done ? colors.sagePale : due ? accent : accentLight;
  const badgeColor = done ? colors.sage : due ? colors.white : accent;
  const badgeLabel = done ? '✓ Done' : due ? 'Due' : formatClock(item.time);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: accentLight }]}>
        <Text style={{ fontSize: 20 }}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.sub}>Scheduled {formatClock(item.time)}</Text>
      </View>
      {canLog ? (
        <Pressable
          style={({ pressed }) => [styles.badge, styles.logBadge, { backgroundColor: accent }, pressed && styles.badgePressed]}
          onPress={onLogNow}
          role="button"
          aria-label={logAccessibilityLabel ?? `Mark ${item.name} as done`}
          hitSlop={6}
        >
          <Text style={[styles.badgeText, { color: colors.white }]}>Mark done</Text>
        </Pressable>
      ) : (
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
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
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  sub: { fontSize: 11, color: colors.stoneMid, marginTop: 2 },
  badge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99 },
  logBadge: { paddingVertical: 7, paddingHorizontal: 12 },
  badgePressed: { opacity: 0.8 },
  badgeText: { fontSize: 11, fontFamily: fonts.extraBold },
});
