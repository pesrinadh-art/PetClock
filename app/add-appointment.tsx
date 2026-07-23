import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { SectionTitle } from '../components/SectionTitle';
import { Toggle } from '../components/Toggle';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { type ApptType } from '../data/mockData';
import { usePets } from '../context/PetsContext';
import { useAppointments } from '../context/AppointmentsContext';
import { formatApptTime, parseAppointmentDateTime } from '../lib/appointmentUtils';

const TYPES: { key: ApptType; icon: string; label: string; bg: string; border: string }[] = [
  { key: 'vet', icon: '🏥', label: 'Vet Visit', bg: colors.apptVetLight, border: colors.apptVet },
  { key: 'groom', icon: '✂️', label: 'Grooming', bg: colors.apptGroomLight, border: colors.apptGroom },
  { key: 'vaccine', icon: '💉', label: 'Vaccination', bg: colors.apptVaccineLight, border: colors.apptVaccine },
  { key: 'other', icon: '📌', label: 'Other', bg: colors.apptOtherLight, border: colors.stoneLight },
];

const MINUTES_PER_DAY = 24 * 60;

const REMINDER_OPTIONS: { label: string; offsetMinutes: number }[] = [
  { label: '1 week before', offsetMinutes: 7 * MINUTES_PER_DAY },
  { label: '1 day before', offsetMinutes: MINUTES_PER_DAY },
  { label: '2 hours before', offsetMinutes: 2 * 60 },
];

const DEFAULT_OFFSETS = [7 * MINUTES_PER_DAY, MINUTES_PER_DAY];

function formatDisplayDate(dateTime: number): string {
  return new Date(dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AddAppointmentScreen() {
  const { pets } = usePets();
  const { appointments, addAppointment, updateAppointment } = useAppointments();
  const { apptId } = useLocalSearchParams<{ apptId?: string }>();
  const editingAppt = apptId ? appointments.find((a) => a.id === apptId) : undefined;
  const isEditing = !!editingAppt;

  const [type, setType] = useState<ApptType>(editingAppt?.type ?? 'vet');
  const [selectedPets, setSelectedPets] = useState<string[]>(
    () => editingAppt?.petIds ?? (pets.length > 0 ? [pets[0].id] : [])
  );
  const [title, setTitle] = useState(editingAppt?.title ?? '');
  const [date, setDate] = useState(editingAppt ? formatDisplayDate(editingAppt.dateTime) : '');
  const [time, setTime] = useState(editingAppt?.hasTime ? formatApptTime(editingAppt.dateTime) : '');
  const [location, setLocation] = useState(editingAppt?.location ?? '');
  const [notes, setNotes] = useState(editingAppt?.notes ?? '');
  const [reminderOffsets, setReminderOffsets] = useState<number[]>(editingAppt?.reminderOffsets ?? DEFAULT_OFFSETS);

  const togglePet = (id: string) => {
    setSelectedPets((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const toggleReminder = (offsetMinutes: number) => {
    setReminderOffsets((prev) =>
      prev.includes(offsetMinutes) ? prev.filter((o) => o !== offsetMinutes) : [...prev, offsetMinutes]
    );
  };

  const parsedDateTime = parseAppointmentDateTime(date.trim(), time.trim() || undefined);
  const canSave = title.trim().length > 0 && !!parsedDateTime;

  const handleSave = () => {
    if (!canSave || !parsedDateTime) return;
    const fields = {
      type,
      title: title.trim(),
      petIds: selectedPets,
      dateTime: parsedDateTime.getTime(),
      hasTime: time.trim().length > 0,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      reminderOffsets,
    };
    if (isEditing && editingAppt) {
      updateAppointment(editingAppt.id, fields);
    } else {
      addAppointment(fields);
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={{ width: 32 }} />
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Appointment' : 'New Appointment'}</Text>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              onPress={() => router.back()}
              hitSlop={8}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <SectionTitle>Type</SectionTitle>
          <View style={styles.typeGrid}>
            {TYPES.map((t) => {
              const selected = type === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setType(t.key)}
                  style={({ pressed }) => [
                    styles.typeChip,
                    { backgroundColor: t.bg, borderColor: selected ? t.border : 'transparent' },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={{ fontSize: 28 }}>{t.icon}</Text>
                  <Text style={styles.typeChipLabel}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Pet(s)</Text>
            <View style={styles.petRow}>
              {pets.map((p) => {
                const selected = selectedPets.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => togglePet(p.id)}
                    style={({ pressed }) => [
                      styles.petChip,
                      selected
                        ? { backgroundColor: colors.sagePale, borderColor: colors.sage }
                        : { backgroundColor: colors.white, borderColor: colors.stoneLight },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: selected ? colors.sage : colors.stoneMid }}>
                      {p.avatar} {p.name}{selected ? ' ✓' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Annual Checkup" />

          <View style={styles.row2}>
            <DatePickerField
              label="Date"
              value={date}
              onChange={setDate}
              placeholder="Jul 4, 2026"
              minDate={new Date()}
              style={{ flex: 1, marginBottom: 14 }}
            />
            <TimePickerField label="Time" value={time} onChange={setTime} placeholder="10:00 AM" style={{ flex: 1, marginBottom: 14 }} />
          </View>

          <Field label="Clinic / Location" value={location} onChangeText={setLocation} placeholder="City Vet Clinic" />
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="e.g. bring vaccination records…" />

          <SectionTitle>Notifications</SectionTitle>
          <View style={styles.notifList}>
            {REMINDER_OPTIONS.map((opt) => (
              <View key={opt.offsetMinutes} style={styles.notifOption}>
                <Text style={styles.notifLabel}>🔔 {opt.label}</Text>
                <Toggle on={reminderOffsets.includes(opt.offsetMinutes)} onToggle={() => toggleReminder(opt.offsetMinutes)} />
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && styles.saveBtnPressed,
            ]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Save Appointment'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  style,
  ...inputProps
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: object;
}) {
  return (
    <View style={[styles.formGroup, style]}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[styles.input, inputProps.value ? styles.inputFilled : null]}
        placeholderTextColor={colors.stoneLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  handle: { width: 40, height: 4, backgroundColor: colors.stoneLight, borderRadius: 99, alignSelf: 'center', marginTop: 12, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: fonts.black, color: colors.stone, textAlign: 'center', flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stoneMid },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeChip: {
    width: '48%',
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
  },
  typeChipLabel: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stone },
  formGroup: { marginBottom: 14, gap: 5 },
  formLabel: { fontSize: 11, fontFamily: fonts.extraBold, textTransform: 'uppercase', letterSpacing: 1, color: colors.stoneMid },
  petRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  petChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 2 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.stone,
  },
  inputFilled: { borderColor: colors.sage },
  row2: { flexDirection: 'row', gap: 10 },
  notifList: { gap: 8, marginBottom: 20 },
  notifOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  notifLabel: { fontSize: 13, fontFamily: fonts.bold, color: colors.stone },
  saveBtn: { backgroundColor: colors.sage, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: colors.stoneLight },
  saveBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  saveBtnText: { color: colors.white, fontSize: 15, fontFamily: fonts.extraBold },
});
