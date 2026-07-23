import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';

type Stat = { value: string; label: string };

type Props = {
  colorsGradient: [string, string];
  watermark: string;
  title: string;
  sub: string;
  stats: Stat[];
};

export function HeroCard({ colorsGradient, watermark, title, sub, stats }: Props) {
  return (
    <LinearGradient colors={colorsGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <Text style={styles.watermark}>{watermark}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statVal}>{s.value}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  watermark: { position: 'absolute', right: 14, top: 10, fontSize: 46, opacity: 0.2 },
  title: { fontSize: 19, fontFamily: fonts.black, color: colors.white, marginBottom: 4 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  statVal: { fontSize: 18, fontFamily: fonts.extraBold, color: colors.white },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
});
