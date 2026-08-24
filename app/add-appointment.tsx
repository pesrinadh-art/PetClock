import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { category, green, ink, line, radius, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Card, GlassSurface, SectionLabel } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { Toggle } from '../components/Toggle';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { PetAvatar } from '../components/PetAvatar';
import { type ApptType } from '../data/mockData';
import { usePets } from '../context/PetsContext';
import { useAppointments } from '../context/AppointmentsContext';
import { formatApptTime, parseAppointmentDateTime } from '../lib/appointmentUtils';
import { allDayToHasTime, hasTimeToAllDay } from '../lib/db/models';

const TYPES: { key: ApptType; icon: IconName; label: string; bg: string; ink: string }[] = [
  { key: 'vet', icon: 'vet', label: 'Vet', bg: category.vetBg, ink: category.vetInk },
  { key: 'vaccine', icon: 'vaccine', label: 'Vaccine', bg: category.vaccineBg, ink: category.vaccineInk },
  { key: 'groom', icon: 'scissors', label: 'Groom', bg: category.groomBg, ink: category.groomInk },
  { key: 'other', icon: 'dots', label: 'Other', bg: category.otherBg, ink: category.otherInk },
];

const MINUTES_PER_DAY = 24 * 60;

const REMINDER_OPTIONS: { label: string; offsetMinutes: number }[] = [
  { label: '1 week before', offsetMinutes: 7 * MINUTES_PER_DAY },
  { label: '1 day before', offsetMinutes: MINUTES_PER_DAY },
  { label: '2 hours before', offsetMinutes: 2 * 60 },
];

const DEFAULT_OFFSETS = [7 * MINUTES_PER_DAY, MINUTES_PER_DAY];

function formatDisplayDate(startsAt: string): string {
  return new Date(startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const [date, setDate] = useState(editingAppt ? formatDisplayDate(editingAppt.startsAt) : '');
  const [time, setTime] = useState(
    editingAppt && allDayToHasTime(editingAppt.allDay) ? formatApptTime(editingAppt.startsAt) : ''
  );
  const [location, setLocation] = useState(editingAppt?.location ?? '');
  const [notes, setNotes] = useState(editingAppt?.notes ?? '');
  const [reminderOffsets, setReminderOffsets] = useState<number[]>(
    editingAppt?.reminderOffsetsMinutes ?? DEFAULT_OFFSETS
  );

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
      startsAt: parsedDateTime.toISOString(),
      allDay: hasTimeToAllDay(time.trim().length > 0),
      location: location.trim() || null,
      notes: notes.trim() || null,
      reminderOffsetsMinutes: reminderOffsets,
    };
    if (isEditing && editingAppt) {
      updateAppointment(editingAppt.id, fields);
    } else {
      addAppointment(fields);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const closeSheet = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <GlassSurface fallbackColor={surface.app} fallbackOpacity={0.98} style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit appointment' : 'New appointment'}</Text>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              onPress={closeSheet}
              role="button"
              aria-label="Close"
              hitSlop={8}
            >
              <Icon name="close" size={15} color={ink.muted} strokeWidth={2.3} />
            </Pressable>
          </View>
        </GlassSurface>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionLabel>Type</SectionLabel>
          <View style={styles.typeGrid}>
            {TYPES.map((t) => {
              const selected = type === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setType(t.key)}
                  role="button"
                  aria-label={t.label}
                  aria-selected={selected}
                  style={({ pressed }) => [
                    styles.typeChip,
                    { backgroundColor: t.bg, borderColor: selected ? t.ink : 'transparent' },
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name={t.icon} size={19} color={t.ink} strokeWidth={2} />
                  <Text style={[styles.typeChipLabel, { color: t.ink }, selected && styles.typeChipLabelSelected]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SectionLabel style={styles.groupLabel}>Pet(s)</SectionLabel>
          <View style={styles.petRow}>
            {pets.map((p) => {
              const selected = selectedPets.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => togglePet(p.id)}
                  role="button"
                  aria-label={p.name}
                  aria-selected={selected}
                  style={({ pressed }) => [
                    styles.petChip,
                    selected
                      ? { backgroundColor: green.tint, borderColor: green.mid }
                      : { backgroundColor: surface.card, borderColor: line.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <PetAvatar pet={p} size={22} emojiSize={13} style={styles.petChipAvatar} />
                  <Text style={[styles.petChipText, { color: selected ? green.primary : ink.muted }]}>
                    {p.name}
                  </Text>
                  {selected && <Icon name="check" size={13} color={green.mid} strokeWidth={3} />}
                </Pressable>
              );
            })}
          </View>

          <Card style={styles.detailsCard}>
            <InsetField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Annual checkup" />
            <View style={styles.hairline} />
            <View style={styles.splitRow}>
              <DatePickerField
                inset
                label="Date"
                value={date}
                onChange={setDate}
                placeholder="Jul 4, 2026"
                minDate={new Date()}
                style={styles.splitCell}
              />
              <View style={styles.vDivider} />
              <TimePickerField
                inset
                label="Time"
                value={time}
                onChange={setTime}
                placeholder="10:00 AM"
                defaultTime="9:00 AM"
                style={styles.splitCell}
              />
            </View>
            <View style={styles.hairline} />
            <InsetField
              label="Clinic / Location"
              icon="mapPin"
              value={location}
              onChangeText={setLocation}
              placeholder="City Vet Clinic"
            />
            <View style={styles.hairline} />
            <InsetField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. bring vaccination records…"
            />
          </Card>

          <SectionLabel style={styles.groupLabel}>Reminders</SectionLabel>
          <Card>
            {REMINDER_OPTIONS.map((opt, i) => (
              <View key={opt.offsetMinutes}>
                <View style={styles.notifOption}>
                  <View style={styles.notifLabelWrap}>
                    <Icon name="bell" size={16} color={ink.muted} strokeWidth={2} />
                    <Text style={styles.notifLabel}>Remind {opt.label}</Text>
                  </View>
                  <Toggle
                    on={reminderOffsets.includes(opt.offsetMinutes)}
                    onToggle={() => toggleReminder(opt.offsetMinutes)}
                    aria-label={`Remind ${opt.label}`}
                  />
                </View>
                {i < REMINDER_OPTIONS.length - 1 && <View style={styles.hairline} />}
              </View>
            ))}
          </Card>

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && styles.saveBtnPressed,
            ]}
            onPress={handleSave}
            disabled={!canSave}
            role="button"
            aria-label={isEditing ? 'Save changes' : 'Save appointment'}
            aria-disabled={!canSave}
          >
            <Icon name="check" size={15} color={ink.onDark} strokeWidth={2.6} />
            <Text style={styles.saveBtnText}>{isEditing ? 'Save changes' : 'Save appointment'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InsetField({
  label,
  icon,
  ...inputProps
}: {
  label: string;
  icon?: IconName;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.insetRow}>
      {icon && (
        <View style={styles.insetIcon}>
          <Icon name={icon} size={16} color={ink.faint} strokeWidth={2} />
        </View>
      )}
      <View style={styles.insetTextWrap}>
        <Text style={styles.insetLabel}>{label}</Text>
        <TextInput
          {...inputProps}
          style={styles.insetInput}
          placeholderTextColor="#c0b8a8"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  flex: { flex: 1 },
  header: { paddingBottom: 4, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  handle: { width: 38, height: 4, backgroundColor: '#ddd6c7', borderRadius: 2, alignSelf: 'center', marginTop: 9 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  modalTitle: { fontSize: 19, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.4 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: surface.chipAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  groupLabel: { marginTop: 20 },
  typeGrid: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
  },
  typeChipLabel: { fontSize: 10.5, fontFamily: fonts.semiBold },
  typeChipLabelSelected: { fontFamily: fonts.bold },
  petRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  petChipAvatar: { backgroundColor: surface.card },
  petChipText: { fontSize: 13, fontFamily: fonts.bold },
  detailsCard: { marginTop: 18 },
  insetRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16 },
  insetIcon: { paddingTop: 20 },
  insetTextWrap: { flex: 1, paddingVertical: 11 },
  insetLabel: { fontSize: 10, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 1.2, color: ink.faint2 },
  insetInput: {
    fontFamily: fonts.semiBold,
    fontSize: 14.5,
    color: ink.primary,
    paddingVertical: 0,
    marginTop: 3,
  },
  hairline: { height: 1, backgroundColor: line.hairline, marginHorizontal: 16 },
  splitRow: { flexDirection: 'row', alignItems: 'stretch' },
  splitCell: { flex: 1 },
  vDivider: { width: 1, backgroundColor: line.hairline, marginVertical: 10 },
  notifOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  notifLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, paddingRight: 8 },
  notifLabel: { fontSize: 14, fontFamily: fonts.semiBold, color: ink.primary },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: green.mid,
    borderRadius: 15,
    paddingVertical: 15,
    marginTop: 18,
    shadowColor: green.mid,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  saveBtnDisabled: { backgroundColor: '#c8c3ba', shadowOpacity: 0 },
  saveBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  saveBtnText: { color: ink.onDark, fontSize: 14, fontFamily: fonts.extraBold },
});
