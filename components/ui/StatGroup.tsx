import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

export type Stat = { value: string; label: string; accent?: string };

/**
 * The stat row under a hero card's divider ("in 2h  Next break · 3  Logs
 * today · 1/2  Meals") and can also stand alone. Stats share the width
 * equally so they line up. Labels are sentence case and >= 12px.
 *
 * Variants: `onDark` (white text over the green/charcoal hero, default) and
 * `onLight`. A stat may carry its own `accent` colour for the value - use
 * amber (`amber.gold` on dark) for "due", never red.
 */
export function StatGroup({
  stats,
  variant = 'onDark',
  style,
}: {
  stats: Stat[];
  variant?: 'onDark' | 'onLight';
  style?: ViewStyle;
}) {
  const onDark = variant === 'onDark';
  const valColor = onDark ? '#ffffff' : ink.primary;
  const lblColor = onDark ? 'rgba(255,255,255,0.8)' : ink.muted;
  return (
    <View style={[styles.row, style]}>
      {stats.map((s) => (
        <View key={s.label} style={styles.stat} aria-label={`${s.label}: ${s.value}`}>
          <Text numberOfLines={1} style={[styles.value, { color: s.accent ?? valColor }]}>
            {s.value}
          </Text>
          <Text numberOfLines={1} style={[styles.label, { color: lblColor }]}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, minWidth: 0 },
  value: { fontFamily: fonts.extraBold, fontSize: 20, letterSpacing: -0.3 },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    marginTop: 2,
  },
});

export default StatGroup;
