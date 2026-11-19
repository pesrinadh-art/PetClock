import { useState } from 'react';
import { possessive } from '../lib/petVoice';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { accent, glass, ink, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Card, GlassSurface, Screen, SectionLabel } from '../components/ui';
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

// Design v2 has one accent: every visit type selects as accent-soft + accent ink.
const TYPES: { key: ApptType; icon: IconName; label: string }[] = [
  { key: 'vet', icon: 'vet', label: 'Vet visit' },
  { key: 'vaccine', icon: 'vaccine', label: 'Vaccine' },
  { key: 'groom', icon: 'scissors', label: 'Grooming' },
  { key: 'other', icon: 'dots', label: 'Other' },
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
  const [titleFocused, setTitleFocused] = useState(false);
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
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <GlassSurface style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              onPress={closeSheet}
              role="button"
              aria-label="Close"
              hitSlop={8}
            >
              <Icon name="close" size={17} color={ink.primary} strokeWidth={1.9} />
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
                  style={({ pressed }) => [styles.chip, styles.petChip, selected && styles.chipOn, pressed && styles.pressed]}
                >
                  <PetAvatar pet={p} size={28} emojiSize={15} style={styles.petChipAvatar} />
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{p.name}</Text>
                  {selected && <Icon name="check" size={14} color={accent.ink} strokeWidth={2} />}
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
                  style={({ pressed }) => [styles.typeChip, selected && styles.typeChipOn, pressed && styles.pressed]}
                >
                  <Icon name={t.icon} size={18} color={selected ? accent.ink : ink.primary} strokeWidth={1.8} />
                  <Text style={[styles.typeChipLabel, selected && styles.chipTextOn]}>{t.label}</Text>
                  {selected && <Icon name="check" size={14} color={accent.ink} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </View>

          <SectionLabel style={styles.groupLabel}>What's it for?</SectionLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
            placeholder={`e.g. ${SUGGESTIONS[type][0]}`}
            placeholderTextColor={ink.placeholder}
            style={[styles.titleInput, titleFocused && styles.inputFocused]}
            aria-label="What's it for?"
          />
          <View style={styles.suggestRow}>
            {SUGGESTIONS[type].map((s) => (
              <Pressable
                key={s}
                onPress={() => setTitle(s)}
                role="button"
                aria-label={`Use "${s}"`}
                style={({ pressed }) => [styles.chip, title === s && styles.chipOn, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, title === s && styles.chipTextOn]}>{s}</Text>
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
                    <View style={styles.notifIcon}>
                      <Icon name="bell" size={15} color={accent.ink} strokeWidth={1.8} />
                    </View>
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

        {/* Sticky save: disabled (faded) until there's a title and a date. */}
        <GlassSurface style={styles.footer}>
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
            <Icon name="check" size={17} color={accent.onAccent} strokeWidth={2} />
            <Text style={styles.saveBtnText}>{saveLabel}</Text>
          </Pressable>
        </GlassSurface>
      </KeyboardAvoidingView>
    </Screen>
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
          <Icon name={icon} size={16} color={ink.muted} strokeWidth={1.8} />
        </View>
      )}
      <View style={styles.insetTextWrap}>
        <Text style={styles.insetLabel}>{label}</Text>
        <TextInput
          {...inputProps}
          style={styles.insetInput}
          placeholderTextColor={ink.placeholder}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingBottom: 4,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  handle: { width: 38, height: 4, backgroundColor: glass.border2, borderRadius: 2, alignSelf: 'center', marginTop: 9 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  modalTitle: { fontSize: 22, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.75, lineHeight: 26 },
  modalSub: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  groupLabel: { marginTop: 24 },

  // `.chip` / `.chip.pick.on`: hairline glass pills; selected = accent-soft + accent ink.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fill,
  },
  chipOn: { backgroundColor: accent.soft, borderColor: accent.line },
  chipText: { fontSize: 13, fontFamily: fonts.regular, color: ink.primary },
  chipTextOn: { color: accent.ink, fontFamily: fonts.medium },

  petRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  petChip: { paddingLeft: 5, gap: 8 },
  petChipAvatar: { backgroundColor: accent.soft },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fill,
  },
  typeChipOn: { backgroundColor: accent.soft, borderColor: accent.line },
  typeChipLabel: { fontSize: 14, fontFamily: fonts.regular, color: ink.primary },

  titleInput: {
    minHeight: 48,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: ink.primary,
  },
  inputFocused: { borderColor: accent.line },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  footerHint: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center', marginBottom: 8 },
  insetRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16 },
  insetIcon: { paddingTop: 18 },
  insetTextWrap: { flex: 1, paddingVertical: 11 },
  insetLabel: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted },
  insetInput: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: ink.primary,
    paddingVertical: 0,
    marginTop: 3,
  },
  hairline: { height: 1, backgroundColor: glass.border, marginHorizontal: 16 },
  splitRow: { flexDirection: 'row', alignItems: 'stretch' },
  splitCell: { flex: 1 },
  vDivider: { width: 1, backgroundColor: glass.border, marginVertical: 10 },
  notifOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  notifLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 },
  notifIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifLabel: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: accent.primary,
    borderRadius: radius.pill,
    ...shadow.fab,
  },
  saveBtnDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  saveBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  saveBtnText: { color: accent.onAccent, fontSize: 15, fontFamily: fonts.medium },
});
