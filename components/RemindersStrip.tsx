import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { glass, ink, radius, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Reminder } from '../data/mockData';

/**
 * Legacy horizontal reminders strip — design v2 `.strip-item`: glass tiles with the time in
 * Geist Mono. Per-type colour accents are gone (one accent rule).
 */
export function RemindersStrip({ reminders }: { reminders: Reminder[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {reminders.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.icon}>{r.icon}</Text>
          <Text numberOfLines={1} style={styles.time}>{r.time}</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.type}>{r.label}</Text>
          <Text numberOfLines={1} style={styles.sub}>{r.sub}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 8, paddingVertical: 6, paddingRight: 4 },
  card: {
    minWidth: 118,
    maxWidth: 220,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 2,
  },
  icon: { fontSize: 18, marginBottom: 6 },
  time: { fontSize: 15, fontFamily: fonts.mono, color: ink.primary, letterSpacing: -0.3 },
  type: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.primary },
  sub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted },
});
