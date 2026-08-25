import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G } from 'react-native-svg';
import { green, ink, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';
import { StatGroup, type Stat } from './StatGroup';

export type { Stat };

const DEFAULT_GRADIENT: [string, string] = [green.gradientFrom, green.gradientTo];

/**
 * The green gradient hero at the top of Home / Pet profile / Household (and a
 * charcoal variant on Appointments). Radius 22, deep soft shadow, a faint paw
 * watermark bleeding off the bottom-right, and — on Home — a progress ring.
 *
 * Two shapes:
 *  • avatar/ring hero — pass `progress` (0–1) for the ring-with-paw, or a custom
 *    `leading` node (e.g. a pet avatar); title + subtitle sit beside it.
 *  • eyebrow hero — pass `eyebrow` for an uppercase label above a large `title`
 *    (used on the Appointments header). No leading element.
 *
 * `stats` renders the divider + {@link StatGroup} underneath either shape.
 * Override `gradient` for the charcoal appointments look
 * (`['#3c3a46','#2a2833']`).
 */
export function HeroCard({
  title,
  subtitle,
  eyebrow,
  stats,
  progress,
  leading,
  gradient = DEFAULT_GRADIENT,
  watermark = true,
  ringColor = '#f3d27a',
  style,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  stats?: Stat[];
  progress?: number;
  leading?: React.ReactNode;
  gradient?: [string, string];
  watermark?: boolean;
  ringColor?: string;
  style?: ViewStyle;
}) {
  const hasLeading = progress != null || leading != null;
  return (
    <LinearGradient
      // 150deg in CSS ≈ this start/end on a roughly square card.
      colors={gradient}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.hero, style]}
    >
      {watermark && (
        <View style={styles.watermark} pointerEvents="none">
          <Icon name="paw" size={108} color="rgba(255,255,255,0.08)" filled />
        </View>
      )}

      {eyebrow != null ? (
        <View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.bigTitle}>{title}</Text>
        </View>
      ) : (
        <View style={styles.headerRow}>
          {hasLeading &&
            (progress != null ? (
              <ProgressRing progress={progress} ringColor={ringColor} />
            ) : (
              leading
            ))}
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
      )}

      {!!stats?.length && (
        <View style={styles.statsWrap}>
          <StatGroup stats={stats} variant="onDark" />
        </View>
      )}
    </LinearGradient>
  );
}

/** 62px progress ring with a paw at its centre (Home). */
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
    padding: 18,
    overflow: 'hidden',
    ...shadow.hero,
  },
  watermark: { position: 'absolute', right: 4, bottom: -10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.extraBold, fontSize: 24, color: ink.onDark, letterSpacing: -0.5, lineHeight: 27 },
  subtitle: { fontFamily: fonts.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.66)',
  },
  bigTitle: { fontFamily: fonts.extraBold, fontSize: 26, color: ink.onDark, letterSpacing: -0.5, marginTop: 3 },
  statsWrap: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
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
