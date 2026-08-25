import * as React from 'react';
import { StyleSheet, Text, View, type TextProps } from 'react-native';
import { ink } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

/**
 * The uppercase tracked section label seen above every card group
 * ("QUICK LOG", "MEAL TIMES", "MEMBERS"). Design spec: 10.5px, weight 700,
 * letter-spacing .14em (~1.5px), colour #9a9184.
 *
 * Optional `right` renders a trailing action ("See all") on the same baseline.
 */
export function SectionLabel({
  children,
  right,
  style,
  ...rest
}: TextProps & { right?: React.ReactNode }) {
  if (right) {
    return (
      <View style={styles.row}>
        <Text style={[styles.label, style]} {...rest}>
          {children}
        </Text>
        {right}
      </View>
    );
  }
  return (
    <Text style={[styles.label, styles.solo, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: ink.faint,
  },
  solo: { marginBottom: 9 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
});

export default SectionLabel;
