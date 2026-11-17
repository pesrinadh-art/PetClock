import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

export type Stat = { value: string; label: string; accent?: string };

/**
 * The stat row that sits under a hero card's divider ("2× Meals/day · 4h Hold
 * time · 1 Medication") and can also stand alone. Two visual variants:
 * `onDark` (white text over the green/charcoal hero, the default) and `onLight`.
 * A stat may carry its own `accent` colour for the value (e.g. red "Overdue").
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
  const lblColor = onDark ? 'rgba(255,255,255,0.78)' : ink.faint;
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
  // Redesign v3: stats share the row evenly and labels are sentence case ("Next break").
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1 },
  value: { fontFamily: fonts.extraBold, fontSize: 20, letterSpacing: -0.2 },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 11.5,
    marginTop: 3,
  },
});

export default StatGroup;
