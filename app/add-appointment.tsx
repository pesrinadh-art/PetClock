import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
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

const TYPES: { key: ApptType; icon: string; label: string; bg: string; border: string }[] = [
  { key: 'vet', icon: '🏥', label: 'Vet Visit', bg: colors.apptVetLight, border: colors.apptVet },
  { key: 'groom', icon: '✂️', label: 'Grooming', bg: colors.apptGroomLight, border: colors.apptGroom },
  { key: 'vaccine', icon: '💉', label: 'Vaccination', bg: colors.apptVaccineLight, border: colors.apptVaccine },
  { key: 'other', icon: '📌', label: 'Other', bg: colors.apptOtherLight, border: colors.stoneLight },
];

const NOTIF_OPTIONS = ['1 week before', '1 day before', '2 hours before', 'Set recurring reminder'];

export default function AddAppointmentScreen() {
  const { pets } = usePets();
  const { addAppointment } = useAppointments();
  const [type, setType] = useState<ApptType>('vet');
  const [selectedPets, setSelectedPets] = useState<string[]>(() => (pets.length > 0 ? [pets[0].id] : []));
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [notifs, setNotifs] = useState<boolean[]>([true, true, false, false]);

  const togglePet = (id: string) => {
    setSelectedPets((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const toggleNotif = (index: number) => {
    setNotifs((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const canSave = title.trim().length > 0 && date.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const petNames = pets.filter((p) => selectedPets.includes(p.id)).map((p) => `${p.avatar} ${p.name}`);
    addAppointment({
      type,
      title: title.trim(),
      petNames,
      date: date.trim(),
      time: time.trim() || undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      reminderEnabled: notifs.some(Boolean),
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <View style={{ width: 32 }} />
          <Text style={styles.modalTitle}>New Appointment</Text>
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
          <DatePickerField label="Date" value={date} onChange={setDate} placeholder="Jul 4, 2026" style={{ flex: 1, marginBottom: 14 }} />
          <TimePickerField label="Time" value={time} onChange={setTime} placeholder="10:00 AM" style={{ flex: 1, marginBottom: 14 }} />
        </View>

        <Field label="Clinic / Location" value={location} onChangeText={setLocation} placeholder="City Vet Clinic" />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="e.g. bring vaccination records…" />

        <SectionTitle>Notifications</SectionTitle>
        <View style={styles.notifList}>
          {NOTIF_OPTIONS.map((label, i) => (
            <View key={label} style={styles.notifOption}>
              <Text style={styles.notifLabel}>🔔 {label}</Text>
              <Toggle on={notifs[i]} onToggle={() => toggleNotif(i)} />
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
          <Text style={styles.saveBtnText}>Save Appointment</Text>
        </Pressable>
      </ScrollView>
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
