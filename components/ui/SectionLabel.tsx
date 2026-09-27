import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps } from 'react-native';
import { green, ink, space } from '../../theme/colors';
import { type } from '../../theme/fonts';

/**
 * Section heading above a card group.
 *
 * Pet-owner redesign: the default is now a friendly SENTENCE-CASE heading
 * (17px extra-bold, ink) - easier to read than tiny tracked caps. Write the
 * text the way you'd say it: "Quick log", "Coming up for Mochi", "Meal times".
 * `variant="eyebrow"` restores the old small uppercase label for dense spots.
 *
 * Optional `hint` renders a muted one-liner under the heading.
 * Optional `right` renders a trailing node; or pass `action={{label,onPress}}`
 * for the standard green "See all" link (48px tap area via hitSlop).
 */
export function SectionLabel({
  children,
  right,
  action,
  hint,
  variant = 'heading',
  style,
  ...rest
}: TextProps & {
  right?: React.ReactNode;
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  hint?: string;
  variant?: 'heading' | 'eyebrow';
}) {
  const labelStyle = variant === 'eyebrow' ? styles.eyebrow : styles.heading;
  const trailing =
    right ??
    (action ? (
      <Pressable
        onPress={action.onPress}
        role="button"
        aria-label={action.accessibilityLabel ?? action.label}
        hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.action}>{action.label}</Text>
      </Pressable>
    ) : null);

  const text = (
    <Text style={[labelStyle, !trailing && !hint && styles.solo, style]} role="heading" {...rest}>
      {children}
    </Text>
  );

  if (!trailing && !hint) return text;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.flex}>{text}</View>
        {trailing}
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.heading, color: ink.primary },
  eyebrow: { ...type.eyebrow, color: ink.faint },
  solo: { marginBottom: space.sm - 2 },
  wrap: { marginBottom: space.sm - 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  flex: { flex: 1, minWidth: 0 },
  hint: { ...type.bodySm, color: ink.muted, marginTop: 2 },
  action: { ...type.bodySm, fontFamily: type.subhead.fontFamily, color: green.primary },
  pressed: { opacity: 0.6 },
});

export default SectionLabel;
