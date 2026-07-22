import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { formatClock } from '../lib/petSchedule';
import type { ScheduleRowItem } from '../lib/petSchedule';

export function ScheduleRow({
  item,
  accent,
  accentLight,
}: {
  item: ScheduleRowItem;
  accent: string;
  accentLight: string;
}) {
  const done = item.status === 'done';
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: accentLight }]}>
        <Text style={{ fontSize: 20 }}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.sub}>Scheduled {formatClock(item.time)}</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: done ? colors.sagePale : accentLight }]}>
        <Text style={[styles.badgeText, { color: done ? colors.sage : accent }]}>
          {done ? '✓ Done' : formatClock(item.time)}
        </Text>
      </View>
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
  badgeText: { fontSize: 11, fontFamily: fonts.extraBold },
});
