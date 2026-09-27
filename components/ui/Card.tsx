import * as React from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { surface, radius, shadow, space, tones, type Tone } from '../../theme/colors';

/**
 * The standard white content card: radius 18, soft top-lit shadow. Used for
 * every grouped list / panel. Pass `padded` for the common 16px inset; omit it
 * when the card wraps its own ListRows (which carry their own padding).
 *
 * Pet-owner additions (all optional, existing usage unchanged):
 *  - `onPress`  makes the whole card one big tap target (with pressed feedback)
 *  - `tone`     paints a soft role tint + border (e.g. tone="pet" for a win card)
 *  - `accessibilityLabel` for tappable cards
 */
export function Card({
  padded = false,
  tone,
  onPress,
  accessibilityLabel,
  style,
  children,
  ...rest
}: ViewProps & {
  padded?: boolean;
  tone?: Tone;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const toneStyle = tone ? { backgroundColor: tones[tone].bg, borderWidth: 1, borderColor: tones[tone].border } : null;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        role="button"
        aria-label={accessibilityLabel}
        style={({ pressed }) => [
          styles.card,
          padded && styles.padded,
          toneStyle,
          style as ViewStyle,
          pressed && styles.pressed,
        ]}
        {...(rest as object)}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, padded && styles.padded, toneStyle, style as ViewStyle]} {...rest}>
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
  padded: { paddingVertical: space.lg, paddingHorizontal: space.lg },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});

export default Card;
