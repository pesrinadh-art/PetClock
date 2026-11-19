import { StyleSheet, Text, View } from 'react-native';
import { glass, ink, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';

type Stat = { value: string; label: string };

type Props = {
  /** @deprecated v3 gradient; ignored in design v2 (glass panel). */
  colorsGradient: [string, string];
  watermark: string;
  title: string;
  sub: string;
  stats: Stat[];
};

/**
 * Legacy hero (prefer `components/ui/HeroCard`). Design v2: a glass panel with ink text, a
 * faint watermark glyph, and mono stats under a hairline. Props unchanged for back-compat.
 */
export function HeroCard({ watermark, title, sub, stats }: Props) {
  return (
    <View style={styles.hero}>
      <Text style={styles.watermark}>{watermark}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text numberOfLines={1} style={styles.statVal}>{s.value}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.statLbl}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.hero,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    ...shadow.hero,
  },
  watermark: { position: 'absolute', right: 14, top: 10, fontSize: 40, opacity: 0.14 },
  title: { fontSize: 20, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.6, marginBottom: 4 },
  sub: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, marginBottom: 14 },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: glass.border,
  },
  stat: { flex: 1 },
  statVal: { fontSize: 16, fontFamily: fonts.mono, color: ink.primary, letterSpacing: -0.3 },
  statLbl: { fontSize: 11.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 3 },
});
