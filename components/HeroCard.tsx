import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { ink, radius, shadow, space } from '../theme/colors';
import { type } from '../theme/fonts';

type Stat = { value: string; label: string };

type Props = {
  colorsGradient: [string, string];
  /** Kept for API compatibility; emoji watermarks are no longer drawn (no emoji as UI icons). */
  watermark?: string;
  title: string;
  sub: string;
  stats: Stat[];
};

/**
 * Legacy gradient hero (the Food screen now uses `components/ui/HeroCard`).
 * Restyled to the pet-owner type scale: bigger title, 2-line subtitle,
 * sentence-case stat labels at >= 12px with AA-contrast white text.
 */
export function HeroCard({ colorsGradient, title, sub, stats }: Props) {
  return (
    <LinearGradient colors={colorsGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <Text style={styles.sub} numberOfLines={2}>{sub}</Text>
      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text numberOfLines={1} style={styles.statVal}>{s.value}</Text>
            <Text numberOfLines={1} style={styles.statLbl}>{s.label}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.hero,
    padding: space.xl,
    marginBottom: space.lg,
    overflow: 'hidden',
    ...shadow.hero,
  },
  title: { ...type.title, color: ink.onDark, marginBottom: 4 },
  sub: { ...type.bodySm, color: ink.onDarkMuted, marginBottom: space.lg },
  statsRow: { flexDirection: 'row', gap: space.xs },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.tile,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    alignItems: 'center',
  },
  statVal: { fontSize: 20, fontFamily: type.title.fontFamily, color: ink.onDark },
  statLbl: { ...type.caption, color: ink.onDarkMuted, marginTop: 2 },
});
