import * as React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { amber, ink, surface, tap, tones, type Tone } from '../../theme/colors';
import { Icon, type IconName } from '../Icon';

/**
 * Round icon chip button - back arrows, bell, settings, close, edit.
 * 44px visual circle + 8px hitSlop so the real target is >= 48px.
 * `accessibilityLabel` is REQUIRED (there is no visible text).
 *
 *   <IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={router.back} />
 *   <IconButton icon="bell" dot accessibilityLabel="Notifications" onPress={...} />
 *   <IconButton icon="pencil" tone="pet" accessibilityLabel="Edit Mochi" ... />
 *   <IconButton icon="close" variant="onDark" ... />   // over a hero gradient
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone,
  variant = 'chip',
  size = tap.icon,
  dot = false,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  tone?: Tone;
  variant?: 'chip' | 'onDark' | 'plain';
  size?: number;
  dot?: boolean;
  style?: ViewStyle;
}) {
  const t = tone ? tones[tone] : null;
  const bg =
    variant === 'onDark'
      ? 'rgba(255,255,255,0.18)'
      : variant === 'plain'
        ? 'transparent'
        : t
          ? t.bg
          : surface.chip;
  const fg = variant === 'onDark' ? ink.onDark : t ? t.ink : ink.primary;
  return (
    <Pressable
      onPress={onPress}
      role="button"
      aria-label={accessibilityLabel}
      hitSlop={tap.hitSlop}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={fg} strokeWidth={2.1} />
      {dot && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.93 }] },
  dot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: amber.primary,
    borderWidth: 2,
    borderColor: surface.app,
  },
});

export default IconButton;
