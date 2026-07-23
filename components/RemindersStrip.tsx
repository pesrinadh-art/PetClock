import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Reminder } from '../data/mockData';

const ACCENTS: Record<Reminder['type'], string> = {
  pee: colors.pee,
  poo: colors.pooLight,
  food: colors.food,
  appt: colors.apptVet,
  medication: colors.medicine,
};

export function RemindersStrip({ reminders }: { reminders: Reminder[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {reminders.map((r) => (
        <View key={r.id} style={[styles.card, { borderTopColor: ACCENTS[r.type] }]}>
          <Text style={styles.icon}>{r.icon}</Text>
          <Text style={styles.type}>{r.label}</Text>
          <Text style={styles.time}>{r.time}</Text>
          <Text style={styles.sub}>{r.sub}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 10, paddingVertical: 6, paddingRight: 4 },
  card: {
    minWidth: 136,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    paddingHorizontal: 14,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    ...shadow.sm,
  },
  icon: { fontSize: 18, marginBottom: 4 },
  type: { fontSize: 10, fontFamily: fonts.extraBold, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.stoneMid },
  time: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone, marginVertical: 2 },
  sub: { fontSize: 11, color: colors.stoneMid },
});
