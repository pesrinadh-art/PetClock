import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
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

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: object;
};

export function TimePickerField({ label, value, onChange, placeholder = 'Select time', style }: Props) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, OPTIONS.indexOf(value));

  return (
    <View style={[styles.formGroup, style]}>
      {label ? <Text style={styles.formLabel}>{label}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.field, value ? styles.fieldFilled : null, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ? `${label}: ` : ''}${value || placeholder}`}
      >
        <Text style={[styles.valueText, !value && styles.placeholderText]}>{value || placeholder}</Text>
        <Text style={styles.icon}>🕐</Text>
      </Pressable>

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
                      accessibilityRole="button"
                      accessibilityLabel="Clear time"
                    >
                      <Text style={styles.clearText}>✕ Clear</Text>
                    </Pressable>
                  );
                }
                const selected = item === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item}
                    accessibilityState={{ selected }}
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
                    {selected && <Text style={styles.check}>✓</Text>}
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
  formGroup: { gap: 5 },
  formLabel: { fontSize: 11, fontFamily: fonts.extraBold, textTransform: 'uppercase', letterSpacing: 1, color: colors.stoneMid },
  field: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldFilled: { borderColor: colors.sage },
  pressed: { opacity: 0.75 },
  valueText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.stone },
  placeholderText: { color: colors.stoneLight },
  icon: { fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '80%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    ...shadow.card,
  },
  sheetTitle: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 10, textAlign: 'center' },
  option: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  optionSelected: { backgroundColor: colors.sagePale },
  optionText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.stone },
  optionTextSelected: { fontFamily: fonts.extraBold, color: colors.sage },
  check: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.sage },
  clearText: { fontSize: 14, fontFamily: fonts.bold, color: colors.stoneMid },
});
