import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';

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
  style?: object;
};

export function DatePickerField({ label, value, onChange, placeholder = 'Select date', minDate, style }: Props) {
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
    <View style={[styles.formGroup, style]}>
      {label ? <Text style={styles.formLabel}>{label}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.field, value ? styles.fieldFilled : null, pressed && styles.pressed]}
        onPress={openPicker}
      >
        <Text style={[styles.valueText, !value && styles.placeholderText]}>{value || placeholder}</Text>
        <Text style={styles.icon}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Pressable style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} onPress={() => changeMonth(-1)}>
                <Text style={styles.navBtnText}>‹</Text>
              </Pressable>
              <Text style={styles.headerTitle}>
                {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]} onPress={() => changeMonth(1)}>
                <Text style={styles.navBtnText}>›</Text>
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
      </Modal>
    </View>
  );
}

const CELL_SIZE = 38;

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
    maxWidth: 340,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    ...shadow.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.sagePale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.sage },
  headerTitle: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  weekdayRow: { flexDirection: 'row', marginBottom: 6 },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: fonts.extraBold,
    color: colors.stoneMid,
  },
  weekRow: { flexDirection: 'row' },
  dayCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayCellPressable: { borderRadius: CELL_SIZE / 2 },
  dayCellToday: { borderWidth: 1.5, borderColor: colors.sage },
  dayCellSelected: { backgroundColor: colors.sage },
  dayText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.stone },
  dayTextSelected: { color: colors.white, fontFamily: fonts.extraBold },
  dayTextDisabled: { color: colors.stoneLight },
});
