import * as React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G } from 'react-native-svg';
import { green, ink, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';
import { PetAvatar } from '../PetAvatar';
import { StatGroup, type Stat } from './StatGroup';

export type { Stat };

const DEFAULT_GRADIENT: [string, string] = [green.gradientFrom, green.gradientTo];

/**
 * The green gradient hero at the top of every main screen (redesign v3).
 *
 * Shapes:
 *  • avatar hero — `leading` (usually a {@link HeroAvatar}) or `progress` (ring-with-paw)
 *    beside a title that may wrap to two lines and a wrapping subtitle.
 *  • eyebrow hero — `eyebrow` (uppercase, e.g. "3 IN YOUR CARE") above a large title.
 *  • centered hero — `centered` stacks the leading avatar, title and subtitle in the
 *    middle (pet profile).
 *
 * `stats` renders the divider + {@link StatGroup}; `children` renders below everything
 * (chips, a "See visit details" button, an avatar stack). Decorative translucent bubbles
 * sit behind the content, bottom-right.
 */
export function HeroCard({
  title,
  subtitle,
  eyebrow,
  stats,
  progress,
  leading,
  centered = false,
  gradient = DEFAULT_GRADIENT,
  watermark = true,
  ringColor = '#f3d27a',
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
  gradient?: [string, string];
  watermark?: boolean;
  ringColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const lead = progress != null ? <ProgressRing progress={progress} ringColor={ringColor} /> : leading;
  return (
    <LinearGradient
      // 150deg in CSS ≈ this start/end on a roughly square card.
      colors={gradient}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.hero, style]}
    >
      {watermark && <Bubbles />}

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
          <StatGroup stats={stats} variant="onDark" />
        </View>
      )}

      {!centered && children}
    </LinearGradient>
  );
}

/** The white avatar circle with a translucent ring that leads a hero ("Getting to know Mochi"). */
export function HeroAvatar({ pet, size = 62 }: { pet: { id: string; avatarEmoji: string }; size?: number }) {
  const ring = Math.round(size * 0.07);
  return (
    <View
      style={{
        width: size + ring * 2,
        height: size + ring * 2,
        borderRadius: (size + ring * 2) / 2,
        backgroundColor: 'rgba(255,255,255,0.28)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PetAvatar pet={pet} size={size} emojiSize={Math.round(size * 0.5)} style={{ backgroundColor: '#e8efe6' }} />
    </View>
  );
}

/** Soft translucent circles + blob bleeding off the bottom-right (design watermark). */
function Bubbles() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.bubble, { width: 26, height: 26, right: 52, bottom: 58 }]} />
      <View style={[styles.bubble, { width: 26, height: 26, right: 14, bottom: 40 }]} />
      <View style={[styles.bubble, { width: 22, height: 22, right: 22, bottom: 92 }]} />
      <View style={[styles.bubble, { width: 84, height: 84, right: 40, bottom: -30, borderRadius: 30 }]} />
    </View>
  );
}

/** 62px progress ring with a paw at its centre (Home, once predictions are live). */
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
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth={4} fill="none" />
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
        <Icon name="paw" size={24} color="#ffffff" strokeWidth={1.8} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.hero,
    padding: 20,
    overflow: 'hidden',
    ...shadow.hero,
  },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  centered: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  title: { fontFamily: fonts.extraBold, fontSize: 25, color: ink.onDark, letterSpacing: -0.6, lineHeight: 28 },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 4, lineHeight: 18 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.78)',
  },
  bigTitle: { fontFamily: fonts.extraBold, fontSize: 27, color: ink.onDark, letterSpacing: -0.6, marginTop: 4, lineHeight: 31 },
  statsWrap: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  ringCenter: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: 7,
    bottom: 7,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HeroCard;
