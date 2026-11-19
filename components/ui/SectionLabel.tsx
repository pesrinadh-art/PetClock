import * as React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { ink } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

/**
 * Section heading above every card group ("Did Mochi go?", "Your family", "Today's meals").
 * Redesign v3: sentence-case bold heading (was an uppercase tracked label), with an optional
 * muted helper line underneath (`sub`, e.g. "Tap to log now. Press and hold to pick a time.").
 *
 * Optional `right` renders a trailing action ("See all") on the heading's baseline.
 */
export function SectionLabel({
  children,
  sub,
  right,
  style,
}: {
  children: React.ReactNode;
  sub?: string;
  right?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.wrap, style as object]}>
      <View style={styles.row}>
        <Text style={styles.label} role="heading">
          {children}
        </Text>
        {right}
      </View>
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    letterSpacing: -0.25,
    color: ink.primary,
  },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: ink.muted, marginTop: 2, lineHeight: 17 },
});

export default SectionLabel;
