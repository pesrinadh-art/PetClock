import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent as accentTokens, glass, ink, radius, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { formatClock } from '../lib/petSchedule';
import type { ScheduleRowItem } from '../lib/petSchedule';

/**
 * Legacy meal/med row. The meal-logging UI now lives inline on the pet profile
 * (built from the `ui/` primitives); this component is retained only for the
 * hidden/retired Food tab and keeps the same props so that screen still
 * compiles. Design v2: a glass row with a soft icon tile, mono times and pill badges.
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
  const badgeBg = done ? accentTokens.soft : due ? accent : accentLight;
  const badgeColor = done ? accentTokens.ink : due ? ink.onDark : ink.primary;
  const badgeLabel = done ? '✓ Done' : due ? 'Due' : formatClock(item.time);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: accentLight }]}>
        <Text style={{ fontSize: 17 }}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.sub}>
          Scheduled <Text style={styles.mono}>{formatClock(item.time)}</Text>
        </Text>
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
          <Text
            numberOfLines={1}
            style={[styles.badgeText, !done && !due && styles.mono, { color: badgeColor }]}
          >
            {badgeLabel}
          </Text>
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
    minHeight: 56,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  sub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  mono: { fontFamily: fonts.monoRegular },
  badge: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill, flexShrink: 0 },
  logBadge: { paddingVertical: 8, paddingHorizontal: 13 },
  badgePressed: { opacity: 0.8 },
  badgeText: { fontSize: 12, fontFamily: fonts.medium },
});
