import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { radius, tones, type Tone } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';

/**
 * A rounded pill / badge - status chips ("Done", "Due soon", "Owner"), count
 * tags. Colour by role: pass `tone` (preferred) or explicit `bg` + `color`.
 *
 *   <Pill tone="pet" icon="check" label="Done" />
 *   <Pill tone="attention" label="A little late" />
 *   <Pill bg={x} color={y} label="Owner" />          // legacy / custom
 *
 * `icon` accepts an IconName (drawn at the right size) or any node.
 * Text is >= 12px; `size="sm"` is for dense rows only.
 */
export function Pill({
  label,
  bg,
  color,
  tone,
  icon,
  size = 'md',
  style,
}: {
  label: string;
  bg?: string;
  color?: string;
  tone?: Tone;
  icon?: React.ReactNode | IconName;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}) {
  const t = tones[tone ?? 'neutral'];
  const background = bg ?? t.bg;
  const fg = color ?? t.ink;
  const dims = size === 'sm' ? styles.sm : styles.md;
  const iconNode =
    typeof icon === 'string' ? (
      <Icon name={icon as IconName} size={size === 'sm' ? 12 : 14} color={fg} strokeWidth={2.6} />
    ) : (
      icon
    );
  return (
    <View style={[styles.pill, dims, { backgroundColor: background }, style]}>
      {iconNode}
      <Text style={[styles.text, { color: fg, fontSize: size === 'sm' ? 12 : 13 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  sm: { paddingVertical: 4, paddingHorizontal: 10 },
  md: { paddingVertical: 6, paddingHorizontal: 12 },
  text: { fontFamily: fonts.bold },
});

export default Pill;
