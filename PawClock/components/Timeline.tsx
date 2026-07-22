import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { TimelineEntry } from '../data/mockData';

const DOT_BG: Record<TimelineEntry['type'], string> = {
  pee: '#FFF8DB',
  poo: '#FBF0EA',
  food: colors.foodLight,
  vet: colors.apptVetLight,
};

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <View style={styles.list}>
      {entries.map((e) => (
        <View key={e.id} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: DOT_BG[e.type] }]}>
            <Text style={{ fontSize: 16 }}>{e.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{e.label}</Text>
            <Text style={styles.sub}>{e.sub}</Text>
          </View>
          <Text style={styles.time}>{e.time}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginBottom: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    marginBottom: 7,
    ...shadow.sm,
  },
  dot: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontFamily: fonts.bold, color: colors.stone },
  sub: { fontSize: 11, color: colors.stoneMid, marginTop: 1 },
  time: { fontFamily: fonts.mono, fontSize: 12, color: colors.stoneMid, marginLeft: 'auto' },
});
