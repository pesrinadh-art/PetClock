import { useState } from 'react';
import { possessive } from '../lib/petVoice';
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
import { joinPetNames } from '../lib/petNames';

const TYPES: { key: ApptType; icon: IconName; label: string; bg: string; ink: string }[] = [
  { key: 'vet', icon: 'vet', label: 'Vet visit', bg: category.vetBg, ink: category.vetInk },
  { key: 'vaccine', icon: 'vaccine', label: 'Vaccine', bg: category.vaccineBg, ink: category.vaccineInk },
  { key: 'groom', icon: 'scissors', label: 'Grooming', bg: category.groomBg, ink: category.groomInk },
  { key: 'other', icon: 'dots', label: 'Other', bg: category.otherBg, ink: category.otherInk },
];

/** Quick-fill titles under "What's it for?", per visit type. */
const SUGGESTIONS: Record<ApptType, string[]> = {
  vet: ['Annual check-up', 'Follow-up visit', 'Dental check'],
  vaccine: ['Rabies booster', 'Annual vaccines', 'Puppy shots'],
  groom: ['Bath & brush', 'Nail trim', 'Full groom'],
  other: ['Training class', 'Boarding', 'Pet sitter'],
};

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

  const chosenPets = pets.filter((p) => selectedPets.includes(p.id));
  const forNames = joinPetNames(chosenPets.map((p) => p.name));
  const saveLabel = isEditing
    ? 'Save changes'
    : chosenPets.length === 1
      ? `Save ${possessive(chosenPets[0].name)} visit`
      : 'Save visit';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <GlassSurface fallbackColor={surface.app} fallbackOpacity={0.98} style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              onPress={closeSheet}
              role="button"
              aria-label="Close"
              hitSlop={8}
            >
              <Icon name="close" size={18} color={ink.primary} strokeWidth={2.2} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{isEditing ? 'Edit visit' : 'Plan a visit'}</Text>
              {!!forNames && <Text style={styles.modalSub}>For {forNames}</Text>}
            </View>
          </View>
        </GlassSurface>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionLabel sub="Tap everyone who's coming along">Who's going?</SectionLabel>
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
                  <PetAvatar pet={p} size={30} emojiSize={17} style={styles.petChipAvatar} />
                  <Text style={[styles.petChipText, { color: selected ? green.primary : ink.primary }]}>
                    {p.name}
                  </Text>
                  {selected && <Icon name="check" size={15} color={green.primary} strokeWidth={2.6} />}
                </Pressable>
              );
            })}
          </View>

          <SectionLabel style={styles.groupLabel}>What kind of visit?</SectionLabel>
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
                    selected
                      ? { backgroundColor: t.bg, borderColor: t.ink }
                      : { backgroundColor: surface.card, borderColor: line.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name={t.icon} size={18} color={selected ? t.ink : ink.primary} strokeWidth={2} />
                  <Text style={[styles.typeChipLabel, { color: selected ? t.ink : ink.primary }]}>{t.label}</Text>
                  {selected && <Icon name="check" size={15} color={t.ink} strokeWidth={2.6} />}
                </Pressable>
              );
            })}
          </View>

          <SectionLabel style={styles.groupLabel}>What's it for?</SectionLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={`e.g. ${SUGGESTIONS[type][0]}`}
            placeholderTextColor={ink.placeholder}
            style={styles.titleInput}
            aria-label="What's it for?"
          />
          <View style={styles.suggestRow}>
            {SUGGESTIONS[type].map((s) => (
              <Pressable
                key={s}
                onPress={() => setTitle(s)}
                role="button"
                aria-label={`Use "${s}"`}
                style={({ pressed }) => [styles.suggestChip, title === s && styles.suggestChipOn, pressed && styles.pressed]}
              >
                <Text style={[styles.suggestText, title === s && { color: green.primary }]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <SectionLabel style={styles.groupLabel} sub="Leave the time empty for an all-day visit">
            When?
          </SectionLabel>
          <Card>
            <View style={styles.splitRow}>
              <DatePickerField
                inset
                label="Date"
                value={date}
                onChange={setDate}
                placeholder="Pick a day"
                minDate={new Date()}
                style={styles.splitCell}
              />
              <View style={styles.vDivider} />
              <TimePickerField
                inset
                label="Time"
                value={time}
                onChange={setTime}
                placeholder="Any time"
                defaultTime="9:00 AM"
                style={styles.splitCell}
              />
            </View>
          </Card>

          <SectionLabel style={styles.groupLabel}>Where?</SectionLabel>
          <Card>
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

        </ScrollView>

        {/* Sticky save: disabled (pale) until there's a title and a date. */}
        <View style={styles.footer}>
          {!canSave && <Text style={styles.footerHint}>Add a title and a date to save.</Text>}
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && styles.saveBtnPressed,
            ]}
            onPress={handleSave}
            disabled={!canSave}
            role="button"
            aria-label={saveLabel}
            aria-disabled={!canSave}
          >
            <Icon name="check" size={18} color={ink.onDark} strokeWidth={2.6} />
            <Text style={styles.saveBtnText}>{saveLabel}</Text>
          </Pressable>
        </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  modalTitle: { fontSize: 23, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.6 },
  modalSub: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 1 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  groupLabel: { marginTop: 24 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeChip: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.tile,
    paddingVertical: 13,
    borderWidth: 1.5,
  },
  typeChipLabel: { fontSize: 14, fontFamily: fonts.bold },
  petRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 16,
    borderRadius: radius.tile,
    borderWidth: 1.5,
  },
  petChipAvatar: { backgroundColor: green.tint },
  petChipText: { fontSize: 14, fontFamily: fonts.bold },
  titleInput: {
    backgroundColor: surface.card,
    borderWidth: 1.5,
    borderColor: line.border,
    borderRadius: radius.tile,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: ink.primary,
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  suggestChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.card,
  },
  suggestChipOn: { borderColor: green.mid, backgroundColor: green.tint },
  suggestText: { fontSize: 13.5, fontFamily: fonts.bold, color: ink.primary },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: line.border,
    backgroundColor: surface.app,
  },
  footerHint: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center', marginBottom: 8 },
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
    borderRadius: radius.card,
    paddingVertical: 16,
    shadowColor: green.mid,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  saveBtnDisabled: { backgroundColor: '#a9c4b0', shadowOpacity: 0, elevation: 0 },
  saveBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  saveBtnText: { color: ink.onDark, fontSize: 16, fontFamily: fonts.bold },
});
