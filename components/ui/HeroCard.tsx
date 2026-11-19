import * as React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { accent, glass, ink, radius, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';
import { PetAvatar } from '../PetAvatar';
import { StatGroup, type Stat } from './StatGroup';

export type { Stat };

/**
 * The hero panel at the top of the main screens — design v2: a glass panel with ink
 * text (it was a green gradient with white text in v3).
 *
 * Shapes:
 *  • avatar hero — `leading` (usually a {@link HeroAvatar}) or `progress` (violet ring
 *    with a paw) beside a title and subtitle.
 *  • eyebrow hero — `eyebrow` (mono kicker, e.g. "3 in your care") above a large title.
 *  • centered hero — `centered` stacks avatar, title and subtitle (pet profile).
 *
 * `stats` renders a hairline + {@link StatGroup}; `children` renders below everything.
 * `gradient`, `watermark` and `ringColor` are accepted for older call sites; only
 * `ringColor` still has an effect.
 */
export function HeroCard({
  title,
  subtitle,
  eyebrow,
  stats,
  progress,
  leading,
  centered = false,
  ringColor = accent.primary,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  stats?: Stat[];
  progress?: number;
  leading?: React.ReactNode;
  centered?: boolean;
  /** @deprecated v3 gradient; ignored in design v2. */
  gradient?: [string, string];
  /** @deprecated ignored in design v2. */
  watermark?: boolean;
  ringColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const lead = progress != null ? <ProgressRing progress={progress} ringColor={ringColor} /> : leading;
  return (
    <View style={[styles.hero, style]}>
      {eyebrow != null ? (
        <View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.bigTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      ) : centered ? (
        <View style={styles.centered}>
          {lead}
          <Text style={[styles.title, styles.centerText, { marginTop: 12 }]} numberOfLines={2}>
            {title}
          </Text>
          {!!subtitle && <Text style={[styles.subtitle, styles.centerText]}>{subtitle}</Text>}
        </View>
      ) : (
        <View style={styles.headerRow}>
          {lead}
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      )}

      {centered && children}

      {!!stats?.length && (
        <View style={styles.statsWrap}>
          <StatGroup stats={stats} variant="onLight" />
        </View>
      )}

      {!centered && children}
    </View>
  );
}

/** The pet avatar that leads a hero: accent-soft circle with a hairline ring. */
export function HeroAvatar({ pet, size = 62 }: { pet: { id: string; avatarEmoji: string }; size?: number }) {
  const ring = Math.round(size * 0.06);
  return (
    <View
      style={{
        width: size + ring * 2,
        height: size + ring * 2,
        borderRadius: (size + ring * 2) / 2,
        backgroundColor: glass.strong,
        borderWidth: 1,
        borderColor: accent.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PetAvatar pet={pet} size={size} emojiSize={Math.round(size * 0.5)} style={{ backgroundColor: accent.soft }} />
    </View>
  );
}

/** 62px violet progress ring with a paw at its centre (Home, once predictions are live). */
function ProgressRing({ progress, ringColor }: { progress: number; ringColor: string }) {
  const size = 62;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circ * (1 - clamped);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Rotate via the SVG transform attribute (rotate deg cx cy) rather than the
            rotation/origin props — react-native-svg-web maps `origin` to an invalid
            `transform-origin` DOM attribute, which React 19 rejects on web. */}
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={accent.soft} strokeWidth={4} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ringColor}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </G>
      </Svg>
      <View style={styles.ringCenter}>
        <Icon name="paw" size={22} color={accent.primary} strokeWidth={1.8} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.hero,
    padding: 18,
    overflow: 'hidden',
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    ...shadow.hero,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  centered: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  title: { fontFamily: fonts.medium, fontSize: 20, color: ink.primary, letterSpacing: -0.6, lineHeight: 25 },
  subtitle: { fontFamily: fonts.regular, fontSize: 13, color: ink.muted, marginTop: 4, lineHeight: 19 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11.5, color: accent.ink },
  bigTitle: { fontFamily: fonts.medium, fontSize: 24, color: ink.primary, letterSpacing: -0.8, marginTop: 4, lineHeight: 28 },
  statsWrap: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: glass.border,
  },
  ringCenter: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 23,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HeroCard;
