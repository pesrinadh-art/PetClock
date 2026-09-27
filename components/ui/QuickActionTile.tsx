import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, radius, shadow, space, surface, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';
import { tapFeedback } from './haptics';

/**
 * Big, one-thumb log tile - the Home quick-log grid (Pee / Poo / Both / Fed)
 * and any "tap to record" choice. Min 96px tall, tinted icon bubble, bold
 * label + optional sublabel ("Last: 2h ago"). Lay out 2-up (or 4-up in one
 * row on wide screens) with `style={{ flex: 1 }}` inside a row with `gap: 10`.
 *
 *   <QuickActionTile icon="drop" tone="pee" label="Pee" sublabel="2h ago" onPress={logPee} />
 *   <QuickActionTile icon="bowl" tone="food" label="Fed" done onPress={logFood} />
 *
 * `done` shows a small green check badge (a gentle "already did this" cue).
 * `variant="filled"` paints the whole tile in the tone tint (for the single
 * most-likely action, e.g. the predicted break).
 */
export function QuickActionTile({
  icon,
  label,
  sublabel,
  tone = 'pet',
  onPress,
  done = false,
  disabled = false,
  variant = 'card',
  accessibilityLabel,
  style,
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  tone?: Tone;
  onPress?: () => void;
  done?: boolean;
  disabled?: boolean;
  variant?: 'card' | 'filled';
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const t = tones[tone];
  const filled = variant === 'filled';
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tapFeedback();
        onPress?.();
      }}
      disabled={disabled}
      role="button"
      aria-label={accessibilityLabel ?? (sublabel ? `${label}, ${sublabel}` : label)}
      style={({ pressed }) => [
        styles.tile,
        filled ? { backgroundColor: t.bg, borderColor: t.border } : null,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.bubble, { backgroundColor: filled ? surface.card : t.bg }]}>
        <Icon name={icon} size={24} color={t.ink} strokeWidth={2.1} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {!!sublabel && (
        <Text style={styles.sub} numberOfLines={1}>
          {sublabel}
        </Text>
      )}
      {done && (
        <View style={styles.check}>
          <Icon name="check" size={12} color={ink.onDark} strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 96,
    borderRadius: radius.card,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    ...shadow.sm,
  },
  bubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  label: { ...type.subhead, color: ink.primary },
  sub: { ...type.caption, color: ink.muted, marginTop: 1 },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tones.pet.solid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  disabled: { opacity: 0.45 },
});

export default QuickActionTile;
