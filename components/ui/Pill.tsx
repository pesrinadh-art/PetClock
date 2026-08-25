import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

/**
 * A rounded pill / badge — status chips ("Owner", "Done", "Pending"), filter
 * chips, count tags. Provide `bg` and `color` from the role tokens (e.g. green
 * tint + green ink for "Done"; amber warn bg/ink for "Pending"). Optional
 * `icon` slot sits left of the label.
 */
export function Pill({
  label,
  bg,
  color,
  icon,
  size = 'md',
  style,
}: {
  label: string;
  bg: string;
  color: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}) {
  const dims = size === 'sm' ? styles.sm : styles.md;
  return (
    <View style={[styles.pill, dims, { backgroundColor: bg }, style]}>
      {icon}
      <Text
        style={[
          styles.text,
          { color, fontSize: size === 'sm' ? 10.5 : 12 },
        ]}
      >
        {label}
      </Text>
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
  sm: { paddingVertical: 4, paddingHorizontal: 9 },
  md: { paddingVertical: 6, paddingHorizontal: 11 },
  text: { fontFamily: fonts.bold },
});

export default Pill;
