import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, glass, ink, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { AppModal } from './AppModal';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseDisplayDate(text: string): Date | null {
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthWeeks(viewDate: Date): (Date | null)[][] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Earliest selectable day (inclusive, compared by calendar day); earlier cells are dimmed and disabled. */
  minDate?: Date;
  /** Renders as a borderless value cell for use inside a grouped card (screen_2d). */
  inset?: boolean;
  style?: object;
};

export function DatePickerField({ label, value, onChange, placeholder = 'Select date', minDate, inset = false, style }: Props) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseDisplayDate(value) ?? new Date());

  const selectedDate = parseDisplayDate(value);
  const today = new Date();
  const minDay = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;
  const weeks = getMonthWeeks(viewDate);

  const openPicker = () => {
    setViewDate(selectedDate ?? new Date());
    setOpen(true);
  };

  const changeMonth = (delta: number) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return (
    <View style={[inset ? styles.insetGroup : styles.formGroup, style]}>
      {inset ? (
        <Pressable
          style={({ pressed }) => [styles.insetField, pressed && styles.pressed]}
          onPress={openPicker}
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
            onPress={openPicker}
            role="button"
            aria-label={`${label ? `${label}: ` : ''}${value || placeholder}`}
          >
            <Text style={[styles.valueText, !value && styles.placeholderText]}>{value || placeholder}</Text>
            <Icon name="calendar" size={16} color={ink.muted} strokeWidth={1.8} />
          </Pressable>
        </>
      )}

      <AppModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Pressable
                style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
                onPress={() => changeMonth(-1)}
                role="button"
                aria-label="Previous month"
              >
                <Icon name="chevronLeft" size={16} color={ink.primary} strokeWidth={1.9} />
              </Pressable>
              <Text style={styles.headerTitle}>
                {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
                onPress={() => changeMonth(1)}
                role="button"
                aria-label="Next month"
              >
                <Icon name="chevronRight" size={16} color={ink.primary} strokeWidth={1.9} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((d, i) => (
                <Text key={i} style={styles.weekdayLabel}>
                  {d}
                </Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.dayCell} />;
                  const selected = selectedDate && isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, today);
                  const disabled = !!minDay && day.getTime() < minDay.getTime();
                  return (
                    <Pressable
                      key={di}
                      disabled={disabled}
                      role="button"
                      aria-label={formatDate(day)}
                      aria-selected={!!selected}
                      aria-disabled={disabled}
                      style={({ pressed }) => [
                        styles.dayCell,
                        styles.dayCellPressable,
                        isToday && !selected && styles.dayCellToday,
                        selected && styles.dayCellSelected,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        onChange(formatDate(day));
                        setOpen(false);
                      }}
                    >
                      <Text style={[styles.dayText, selected && styles.dayTextSelected, disabled && styles.dayTextDisabled]}>
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Pressable>
        </Pressable>
      </AppModal>
    </View>
  );
}

const CELL_SIZE = 38;

const styles = StyleSheet.create({
  formGroup: { gap: 6 },
  formLabel: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginHorizontal: 2 },
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
    maxWidth: 340,
    backgroundColor: surface.solid,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: glass.border,
    padding: 18,
    ...shadow.hero,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.3 },
  weekdayRow: { flexDirection: 'row', marginBottom: 6 },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: fonts.monoRegular,
    color: ink.muted,
  },
  weekRow: { flexDirection: 'row' },
  dayCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayCellPressable: { borderRadius: CELL_SIZE / 2 },
  dayCellToday: { borderWidth: 1, borderColor: accent.line, backgroundColor: accent.soft },
  dayCellSelected: { backgroundColor: accent.primary },
  dayText: { fontSize: 13, fontFamily: fonts.monoRegular, color: ink.primary },
  dayTextSelected: { color: accent.onAccent, fontFamily: fonts.mono },
  dayTextDisabled: { opacity: 0.3 },
});
