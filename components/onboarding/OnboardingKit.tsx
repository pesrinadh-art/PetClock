import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { green, ink, radius, shadow, space, surface, tones, type Tone } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';

/**
 * Small presentational pieces shared by the first-run screens (/auth and /onboarding).
 * No data, no navigation — layout and copy only.
 */

/** Green gradient brand mark: rounded paw tile. Used on welcome + auth. */
export function BrandMark({ size = 72 }: { size?: number }) {
  return (
    <LinearGradient
      colors={[green.gradientFrom, green.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.brandMark, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}
    >
      <Icon name="paw" size={Math.round(size * 0.52)} color={ink.onDark} strokeWidth={2} />
    </LinearGradient>
  );
}

/** "PawClock" wordmark, small — the brand sits quietly under the pet-first headline. */
export function Wordmark({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.wordmarkRow, style]}>
      <Text style={styles.wordmark}>PawClock</Text>
    </View>
  );
}

/**
 * Step progress: "Step 1 of 2" caption + segmented bar. Pairs text with the bar so
 * progress is never colour-only.
 */
export function StepProgress({ step, total, caption }: { step: number; total: number; caption?: string }) {
  return (
    <View style={styles.progressWrap} aria-label={`Step ${step} of ${total}`}>
      <View style={styles.progressBar}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[styles.progressSeg, i < step && styles.progressSegOn]} />
        ))}
      </View>
      <Text style={styles.progressText}>
        Step {step} of {total}
        {caption ? <Text style={styles.progressCaption}>{`  ·  ${caption}`}</Text> : null}
      </Text>
    </View>
  );
}

/** One value line on the welcome screen: tinted icon bubble + title + one short line. */
export function ValueRow({ icon, tone, title, body }: { icon: IconName; tone: Tone; title: string; body: string }) {
  const t = tones[tone];
  return (
    <View style={styles.valueRow}>
      <View style={[styles.valueIcon, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={22} color={t.ink} strokeWidth={2.1} />
      </View>
      <View style={styles.valueText}>
        <Text style={styles.valueTitle}>{title}</Text>
        <Text style={styles.valueBody}>{body}</Text>
      </View>
    </View>
  );
}

/** Gentle inline notice (amber for "check this", green for good news). Icon + text, never colour-only. */
export function InlineNotice({ tone, message }: { tone: 'attention' | 'pet'; message: string }) {
  const t = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.border }]} role={tone === 'attention' ? 'alert' : 'status'}>
      <Icon name={tone === 'attention' ? 'info' : 'check'} size={18} color={t.ink} strokeWidth={2.2} />
      <Text style={[styles.noticeText, { color: t.ink }]}>{message}</Text>
    </View>
  );
}

/** Soft card used for form groups on first-run screens. */
export function FormCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  brandMark: {
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hero,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: fonts.extraBold, fontSize: 17, letterSpacing: -0.2, color: green.primary },

  progressWrap: { gap: space.xs },
  progressBar: { flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: green.tint },
  progressSegOn: { backgroundColor: green.mid },
  progressText: { ...type.caption, fontFamily: fonts.bold, color: green.primary },
  progressCaption: { fontFamily: fonts.semiBold, color: ink.muted },

  valueRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  valueIcon: { width: 48, height: 48, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  valueText: { flex: 1, minWidth: 0 },
  valueTitle: { ...type.subhead, color: ink.primary },
  valueBody: { ...type.bodySm, color: ink.muted, marginTop: 1 },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.tile,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  noticeText: { ...type.bodySm, fontFamily: fonts.semiBold, flex: 1 },

  card: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.lg,
    ...shadow.card,
  },
});
