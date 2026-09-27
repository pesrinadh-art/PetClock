import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { green, ink, line, radius, space, surface, tap, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';

/**
 * Selectable chip for single/multi choice: species picker, appointment type,
 * which pets a visit is for, filter tabs. 48px tall, clear selected state
 * (tinted fill + tone border + check), never colour-only.
 *
 *   <ChoiceChip label="Dog" leading={<Text>🐶</Text>} selected={s==='dog'} onPress={...} />
 *   <ChoiceChip label="Vet" icon="vet" tone="vet" selected ... />
 *   <ChoiceChip label="Mochi" leading={<PetAvatar pet={p} size={28} />} selected ... />
 *
 * Wrap several in <ChoiceChipRow> for a wrapping row with consistent gaps.
 */
export function ChoiceChip({
  label,
  selected = false,
  onPress,
  icon,
  leading,
  tone = 'pet',
  multi = false,
  fill = false,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  leading?: React.ReactNode;
  tone?: Tone;
  /** Multi-select semantics (checkbox role) instead of radio. */
  multi?: boolean;
  /** Stretch to share the row equally (flex: 1). */
  fill?: boolean;
  style?: ViewStyle;
}) {
  const t = tones[tone];
  const fg = selected ? (tone === 'pet' ? green.primary : t.ink) : ink.primary;
  return (
    <Pressable
      onPress={onPress}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      aria-label={label}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: t.bg, borderColor: tone === 'pet' ? green.mid : t.solid } : null,
        fill && styles.fill,
        pressed && styles.pressed,
        style,
      ]}
    >
      {leading}
      {icon ? <Icon name={icon} size={18} color={selected ? fg : ink.muted} strokeWidth={2.1} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={15} color={fg} strokeWidth={2.8} /> : null}
    </Pressable>
  );
}

export function ChoiceChipRow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: tap.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.card,
  },
  fill: { flex: 1 },
  label: { ...type.subhead, fontSize: 14.5 },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});

export default ChoiceChip;
