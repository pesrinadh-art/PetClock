import * as React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { glass, radius, shadow, surface } from '../../theme/colors';

/**
 * The standard glass panel (design v2 `.list.glass` / `.card.glass`): translucent
 * white, hairline border, radius 24 and a faint wide shadow. Used for every grouped
 * list / panel. Pass `padded` for the common 16px inset; omit it when the card wraps
 * its own ListRows (which carry their own padding).
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
    borderWidth: 1,
    borderColor: glass.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  padded: { paddingVertical: 16, paddingHorizontal: 16 },
});

export default Card;
