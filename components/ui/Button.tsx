import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { green, ink, line, radius, surface, tap, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';
import { tapFeedback } from './haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost';

/**
 * The one button. Every primary action on a screen is a `<Button>`:
 *
 *   <Button label="Save Mochi" icon="check" onPress={save} fullWidth />   // big green CTA (56px)
 *   <Button label="Log dinner" tone="food" onPress={...} />               // solid terracotta
 *   <Button label="Not now" variant="ghost" onPress={...} />              // text-only
 *   <Button label="Add a medication" variant="soft" icon="plus" ... />    // tinted
 *   <Button label="Cancel" variant="secondary" size="md" ... />           // white with border
 *
 * Sizes: `lg` = 56px (default, the screen's main CTA), `md` = 48px (inline /
 * secondary). Both clear the 48px tap-target minimum. `fullWidth` stretches.
 * `tone` recolours primary/soft/ghost by role (pet green by default).
 * Primary presses fire a light haptic on native.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  tone = 'pet',
  size = 'lg',
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  loading = false,
  haptic = true,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  tone?: Tone;
  size?: 'lg' | 'md';
  icon?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle | ViewStyle[];
}) {
  const t = tones[tone];
  const solid = tone === 'pet' ? green.mid : t.solid;
  let bg: string = solid;
  let fg: string = ink.onDark;
  let border: string | undefined;
  if (variant === 'secondary') {
    bg = surface.card;
    fg = tone === 'pet' ? green.primary : t.ink;
    border = line.border;
  } else if (variant === 'soft') {
    bg = t.bg;
    fg = t.ink;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    fg = tone === 'pet' ? green.primary : t.ink;
  }
  const height = size === 'lg' ? tap.primary : tap.min;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        if (haptic && variant === 'primary') tapFeedback();
        onPress?.();
      }}
      disabled={inactive}
      role="button"
      aria-label={accessibilityLabel ?? label}
      aria-disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: bg,
          paddingHorizontal: size === 'lg' ? 22 : 18,
        },
        border ? { borderWidth: 1.5, borderColor: border } : null,
        variant === 'primary' && !inactive ? styles.lift : null,
        fullWidth ? styles.full : styles.hug,
        inactive && styles.disabled,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} color={fg} strokeWidth={2.3} />}
          <Text style={[styles.label, { color: fg, fontSize: size === 'lg' ? 16.5 : 15 }]} numberOfLines={1}>
            {label}
          </Text>
          {iconRight && <Icon name={iconRight} size={18} color={fg} strokeWidth={2.3} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lift: {
    shadowColor: '#2f6b45',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  full: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...type.button },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
});

export default Button;
