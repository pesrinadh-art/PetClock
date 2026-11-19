import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, glass, ink, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { AppModal } from './AppModal';

const ITEM_HEIGHT = 46;

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const period = h < 12 ? 'AM' : 'PM';
      let hour12 = h % 12;
      if (hour12 === 0) hour12 = 12;
      slots.push(`${hour12}:${m.toString().padStart(2, '0')} ${period}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();
const CLEAR_OPTION = '__clear__';
const OPTIONS = [CLEAR_OPTION, ...TIME_SLOTS];

// Where an empty picker opens when no `defaultTime` is supplied (breakfast-ish),
// instead of the top of the list (12:00 AM / the Clear row).
const DEFAULT_TIME = '8:00 AM';

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: object;
  /** Renders as a borderless value cell for use inside a grouped card (screen_2d). */
  inset?: boolean;
  // Realistic "h:mm AM/PM" time to scroll to when `value` is empty. This ONLY
  // positions the list on open; it never pre-fills the field or fires onChange.
  defaultTime?: string;
};

export function TimePickerField({ label, value, onChange, placeholder = 'Select time', style, inset = false, defaultTime }: Props) {
  const [open, setOpen] = useState(false);
  // When there's a value, scroll to it. Otherwise scroll to a realistic default
  // (prop, else module fallback) so the empty picker doesn't open at midnight.
  // The field itself stays empty until the user taps a slot — no onChange here.
  let targetIndex = OPTIONS.indexOf(value);
  if (targetIndex < 0) {
    targetIndex = OPTIONS.indexOf(defaultTime ?? DEFAULT_TIME);
    if (targetIndex < 0) targetIndex = OPTIONS.indexOf(DEFAULT_TIME);
  }
  // Guard bounds so getItemLayout/initialScrollIndex can never throw.
  const selectedIndex = Math.min(Math.max(0, targetIndex), OPTIONS.length - 1);

  return (
    <View style={[inset ? styles.insetGroup : styles.formGroup, style]}>
      {inset ? (
        <Pressable
          style={({ pressed }) => [styles.insetField, pressed && styles.pressed]}
          onPress={() => setOpen(true)}
          role="button"
          aria-label={`${label ? `${label}: ` : ''}${value || placeholder}`}
        >
          {label ? <Text style={styles.insetLabel}>{label}</Text> : null}
          <Text style={[styles.insetValue, !value && styles.insetPlaceholder]}>{value || placeholder}</Text>
        </Pressable>
      ) : (
        <>
          {label ? <Text style={styles.formLabel}>{label}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.field, value ? styles.fieldFilled : null, pressed && styles.pressed]}
            onPress={() => setOpen(true)}
            role="button"
            aria-label={`${label ? `${label}: ` : ''}${value || placeholder}`}
          >
            <Text style={[styles.valueText, !value && styles.placeholderText]}>{value || placeholder}</Text>
            <Icon name="clock" size={16} color={ink.muted} strokeWidth={1.8} />
          </Pressable>
        </>
      )}

      <AppModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label || 'Select time'}</Text>
            <FlatList
              data={OPTIONS}
              keyExtractor={(t) => t}
              style={{ maxHeight: 320 }}
              getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
              initialScrollIndex={selectedIndex}
              renderItem={({ item }) => {
                if (item === CLEAR_OPTION) {
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                      onPress={() => {
                        onChange('');
                        setOpen(false);
                      }}
                      role="button"
                      aria-label="Clear time"
                    >
                      <View style={styles.clearRow}>
                        <Icon name="close" size={14} color={ink.muted} strokeWidth={2.2} />
                        <Text style={styles.clearText}>Clear</Text>
                      </View>
                    </Pressable>
                  );
                }
                const selected = item === value;
                return (
                  <Pressable
                    role="button"
                    aria-label={item}
                    aria-selected={selected}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item}</Text>
                    {selected && <Icon name="check" size={15} color={accent.ink} strokeWidth={2} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { gap: 6 },
  formLabel: { fontSize: 13.5, fontFamily: fonts.medium, color: ink.primary },
  field: {
    minHeight: 46,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldFilled: { borderColor: accent.line },
  // inset (card cell) variant
  insetGroup: {},
  insetField: { paddingVertical: 12, paddingHorizontal: 16 },
  insetLabel: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted },
  insetValue: { fontFamily: fonts.mono, fontSize: 14.5, color: ink.primary, marginTop: 3 },
  insetPlaceholder: { fontFamily: fonts.regular, color: ink.placeholder },
  pressed: { opacity: 0.7 },
  valueText: { fontFamily: fonts.mono, fontSize: 14, color: ink.primary },
  placeholderText: { fontFamily: fonts.regular, color: ink.placeholder },
  overlay: { flex: 1, backgroundColor: glass.scrimDark, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '80%',
    backgroundColor: surface.solid,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: glass.border,
    padding: 16,
    ...shadow.hero,
  },
  sheetTitle: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.3, marginBottom: 10, textAlign: 'center' },
  option: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: radius.tile,
  },
  optionSelected: { backgroundColor: accent.soft },
  optionText: { fontSize: 14, fontFamily: fonts.monoRegular, color: ink.primary },
  optionTextSelected: { fontFamily: fonts.mono, color: accent.ink },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  clearText: { fontSize: 14, fontFamily: fonts.regular, color: ink.muted },
});
