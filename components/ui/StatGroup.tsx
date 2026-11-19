import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

export type Stat = { value: string; label: string; accent?: string };

/**
 * The stat row under a hero's hairline ("2× Meals/day · 4h Hold time · 1 Medication").
 * Values are Geist Mono (every number in design v2 is mono). `onLight` is the default
 * now that heroes are glass; `onDark` stays for any dark surface.
 */
export function StatGroup({
  stats,
  variant = 'onLight',
  style,
}: {
  stats: Stat[];
  variant?: 'onDark' | 'onLight';
  style?: ViewStyle;
}) {
  const onDark = variant === 'onDark';
  const valColor = onDark ? '#ffffff' : ink.primary;
  const lblColor = onDark ? 'rgba(255,255,255,0.78)' : ink.muted;
  return (
    <View style={[styles.row, style]}>
      {stats.map((s) => (
        <View key={s.label} style={styles.stat}>
          <Text numberOfLines={1} style={[styles.value, { color: s.accent ?? valColor }]}>
            {s.value}
          </Text>
          <Text numberOfLines={2} style={[styles.label, { color: lblColor }]}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1 },
  value: { fontFamily: fonts.mono, fontSize: 16, letterSpacing: -0.3 },
  label: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 3 },
});

export default StatGroup;
