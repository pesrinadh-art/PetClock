import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G } from 'react-native-svg';
import { amber, green, ink, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';
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
 *
 * Pet-owner additions (optional, existing usage unchanged):
 *  - `children` renders under the header/stats (e.g. a <ProgressBar variant="onDark">
 *    or a friendly one-liner)
 *  - `action` renders a white pill CTA at the bottom ("Log a break", "Edit Mochi")
 *  - `right` renders a node at the header's trailing edge (e.g. an onDark IconButton)
 *  - subtitle may wrap to 2 lines
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
  ringColor = amber.gold,
  children,
  action,
  right,
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
  children?: React.ReactNode;
  action?: { label: string; onPress: () => void; icon?: IconName };
  right?: React.ReactNode;
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
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.bigTitle} role="heading">
              {title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            )}
          </View>
          {right}
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
            <Text style={styles.title} numberOfLines={2} role="heading">
              {title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            )}
          </View>
          {right}
        </View>
      )}

      {!!stats?.length && (
        <View style={styles.statsWrap}>
          <StatGroup stats={stats} variant="onDark" />
        </View>
      )}

      {children ? <View style={styles.childrenWrap}>{children}</View> : null}

      {action ? (
        <Pressable
          onPress={action.onPress}
          role="button"
          aria-label={action.label}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          {action.icon ? <Icon name={action.icon} size={18} color={green.primary} strokeWidth={2.4} /> : null}
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
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
    padding: 20,
    overflow: 'hidden',
    ...shadow.hero,
  },
  watermark: { position: 'absolute', right: 4, bottom: -10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.extraBold, fontSize: 26, color: ink.onDark, letterSpacing: -0.5, lineHeight: 30 },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: ink.onDarkMuted, marginTop: 3 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.8)',
  },
  bigTitle: { fontFamily: fonts.extraBold, fontSize: 27, color: ink.onDark, letterSpacing: -0.5, marginTop: 3 },
  childrenWrap: { marginTop: 16 },
  action: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  actionPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  actionText: { fontFamily: fonts.extraBold, fontSize: 15.5, color: green.primary },
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
