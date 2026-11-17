import * as React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { surface, radius, shadow } from '../../theme/colors';

/**
 * The standard white content card: radius 18, soft top-lit shadow
 * (`0 4px 14px -10px rgba(42,39,36,.45)` in the design). Used for every grouped
 * list / panel. Pass `padded` for the common 14–16px inset; omit it when the
 * card wraps its own ListRows (which carry their own padding).
 */
export function Card({
  padded = false,
  style,
  children,
  ...rest
}: ViewProps & { padded?: boolean }) {
  return (
    <View style={[styles.card, padded && styles.padded, style as ViewStyle]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadow.card,
  },
  padded: { paddingVertical: 14, paddingHorizontal: 16 },
});

export default Card;
