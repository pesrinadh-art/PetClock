import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet, TimelineEntry } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { formatClock } from '../lib/petSchedule';

type LogButtonSpec = {
  key: string;
  emoji: string;
  label: string;
  sub: string;
  bg: string;
  border: string;
};

function mostRecentLog(logs: TimelineEntry[], type: 'pee' | 'poo') {
  const matches = logs.filter((l) => l.type === type);
  if (matches.length === 0) return null;
  return matches.reduce((latest, l) => (l.timestamp > latest.timestamp ? l : latest));
}

export function LogButtons({ pet, onLog }: { pet: Pet; onLog?: (key: string) => void }) {
  const { getLogsForPet } = useLogs();
  const logs = getLogsForPet(pet.id);

  const lastPee = mostRecentLog(logs, 'pee');
  const lastPoo = mostRecentLog(logs, 'poo');

  const buttons: LogButtonSpec[] = [
    {
      key: 'pee',
      emoji: '💧',
      label: 'Pee',
      sub: lastPee ? `Last ${formatClock(new Date(lastPee.timestamp))}` : 'No logs yet',
      bg: '#FFF8DB',
      border: colors.pee,
    },
    {
      key: 'poo',
      emoji: '💩',
      label: 'Poo',
      sub: lastPoo ? `Last ${formatClock(new Date(lastPoo.timestamp))}` : 'No logs yet',
      bg: '#FBF0EA',
      border: colors.pooLight,
    },
  ];

  return (
    <View style={styles.row}>
      {buttons.map((b) => (
        <Pressable
          key={b.key}
          onPress={() => onLog?.(b.key)}
          accessibilityRole="button"
          accessibilityLabel={`Log ${b.label.toLowerCase()} for ${pet.name}. ${b.sub}`}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: b.bg, borderColor: b.border },
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.emoji}>{b.emoji}</Text>
          <Text style={styles.label}>{b.label}</Text>
          <Text style={styles.sub}>{b.sub}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  btn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  btnPressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  emoji: { fontSize: 28 },
  label: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stone },
  sub: { fontSize: 10, color: colors.stoneMid, textAlign: 'center' },
});
