import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ink, line, space, tones } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import {
  Button,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  Pill,
  Screen,
  ScreenHeader,
  SectionLabel,
  TextField,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { Toggle } from '../components/Toggle';
import { DatePickerField } from '../components/DatePickerField';
import { TimePickerField } from '../components/TimePickerField';
import { PetAvatar } from '../components/PetAvatar';
import { APPT_TYPE_META, APPT_TYPE_ORDER } from '../components/appointments/apptMeta';
import { type ApptType } from '../data/mockData';
import { usePets } from '../context/PetsContext';
import { useAppointments } from '../context/AppointmentsContext';
import { formatApptTime, parseAppointmentDateTime } from '../lib/appointmentUtils';
import { allDayToHasTime, hasTimeToAllDay } from '../lib/db/models';
import { friendlyIn, joinNames, possessive } from '../lib/petVoice';

const MINUTES_PER_DAY = 24 * 60;

const REMINDER_OPTIONS: { label: string; hint: string; offsetMinutes: number }[] = [
  { label: 'A week before', hint: 'Plenty of time to plan ahead', offsetMinutes: 7 * MINUTES_PER_DAY },
  { label: 'The day before', hint: 'Pack records and treats', offsetMinutes: MINUTES_PER_DAY },
  { label: '2 hours before', hint: 'A heads-up to get going', offsetMinutes: 2 * 60 },
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

  // ── Presentation-only derivations ───────────────────────────────────────
  const meta = APPT_TYPE_META[type];
  const chosenPets = pets.filter((p) => selectedPets.includes(p.id));
  const chosenNames = chosenPets.length > 0 ? joinNames(chosenPets.map((p) => p.name)) : null;
  const headerSubtitle = chosenNames
    ? `For ${chosenNames}`
    : pets.length > 0
      ? "Pick who's going below"
      : 'Vet, vaccines and grooming';
  const saveLabel = isEditing
    ? 'Save changes'
    : chosenPets.length === 1
      ? `Save ${possessive(chosenPets[0].name)} visit`
      : 'Save visit';
  const missing: string[] = [];
  if (!title.trim()) missing.push('a title');
  if (!date.trim()) missing.push('a date');
  const saveHint = canSave
    ? null
    : missing.length > 0
      ? `Add ${missing.join(' and ')} to save.`
      : 'That date or time looks a little off. Pick one from the list?';
  const now = new Date();
  const whenPreview =
    parsedDateTime && parsedDateTime.getTime() > now.getTime()
      ? `That's ${friendlyIn(parsedDateTime, now)}`
      : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        edges={[]}
        keyboardShouldPersistTaps="handled"
        header={
          <View>
            <View style={styles.handle} />
            <ScreenHeader
              title={isEditing ? 'Edit visit' : 'Plan a visit'}
              subtitle={headerSubtitle}
              backIcon="close"
              backLabel="Close"
              onBack={closeSheet}
            />
          </View>
        }
        contentStyle={styles.content}
        footer={
          <View style={styles.footerInner}>
            {!!saveHint && (
              <Text style={styles.saveHint} role="status">
                {saveHint}
              </Text>
            )}
            <Button
              label={saveLabel}
              icon="check"
              fullWidth
              disabled={!canSave}
              onPress={handleSave}
              accessibilityLabel={isEditing ? 'Save changes' : 'Save appointment'}
            />
          </View>
        }
      >
        {pets.length > 0 && (
          <>
            <SectionLabel hint="Tap everyone who's coming along">Who's going?</SectionLabel>
            <ChoiceChipRow>
              {pets.map((p) => (
                <ChoiceChip
                  key={p.id}
                  multi
                  label={p.name}
                  selected={selectedPets.includes(p.id)}
                  onPress={() => togglePet(p.id)}
                  leading={<PetAvatar pet={p} size={30} emojiSize={17} />}
                />
              ))}
            </ChoiceChipRow>
          </>
        )}

        <SectionLabel style={pets.length > 0 ? styles.groupLabel : undefined}>What kind of visit?</SectionLabel>
        <View style={styles.typeGrid}>
          {APPT_TYPE_ORDER.map((key) => {
            const m = APPT_TYPE_META[key];
            return (
              <View key={key} style={styles.typeCell}>
                <ChoiceChip
                  label={m.label}
                  icon={m.icon}
                  tone={m.tone}
                  selected={type === key}
                  onPress={() => setType(key)}
                  fill
                />
              </View>
            );
          })}
        </View>

        <View style={styles.groupLabel}>
          <TextField
            label="What's it for?"
            value={title}
            onChangeText={setTitle}
            placeholder={meta.placeholder}
            returnKeyType="done"
          />
          <ChoiceChipRow style={styles.suggestions}>
            {meta.suggestions.map((s) => (
              <ChoiceChip
                key={s}
                label={s}
                tone={meta.tone}
                selected={title.trim() === s}
                onPress={() => setTitle(s)}
              />
            ))}
          </ChoiceChipRow>
        </View>

        <SectionLabel style={styles.groupLabel} hint="Leave the time empty for an all-day visit">
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
        {!!whenPreview && (
          <Pill tone="pet" icon="clock" label={whenPreview} style={styles.whenPill} />
        )}

        <SectionLabel style={styles.groupLabel}>Where and what to bring</SectionLabel>
        <View style={styles.fields}>
          <TextField
            label="Clinic or place"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. City Vet Clinic"
          />
          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Bring vaccine records and a favourite treat"
            hint={chosenNames ? `Anything to remember for ${chosenNames}.` : 'Anything to remember on the day.'}
            multiline
            style={styles.notesInput}
          />
        </View>

        <SectionLabel
          style={styles.groupLabel}
          hint={
            chosenNames ? `So ${chosenNames} never misses a visit` : "We'll nudge you before the visit"
          }
        >
          Reminders
        </SectionLabel>
        <Card>
          {REMINDER_OPTIONS.map((opt, i) => {
            const on = reminderOffsets.includes(opt.offsetMinutes);
            return (
              <View key={opt.offsetMinutes}>
                <View style={styles.notifOption}>
                  <Icon name="bell" size={18} color={on ? tones.pet.ink : ink.muted} strokeWidth={2} />
                  <View style={styles.notifText}>
                    <Text style={styles.notifLabel}>{opt.label}</Text>
                    <Text style={styles.notifHint}>{opt.hint}</Text>
                  </View>
                  <Toggle
                    on={on}
                    onToggle={() => toggleReminder(opt.offsetMinutes)}
                    aria-label={`Remind ${opt.label.toLowerCase()}`}
                  />
                </View>
                {i < REMINDER_OPTIONS.length - 1 && <View style={styles.hairline} />}
              </View>
            );
          })}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: line.dashed,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: space.xs,
  },
  content: { paddingTop: space.xs },
  groupLabel: { marginTop: space.section },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  typeCell: { flexBasis: '47%', flexGrow: 1 },
  suggestions: { marginTop: space.sm },
  splitRow: { flexDirection: 'row', alignItems: 'stretch' },
  splitCell: { flex: 1 },
  vDivider: { width: 1, backgroundColor: line.hairline, marginVertical: 10 },
  whenPill: { marginTop: space.sm },
  fields: { gap: space.lg },
  notesInput: { minHeight: 76, textAlignVertical: 'top' },
  notifOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingVertical: space.xs,
    paddingHorizontal: space.lg,
  },
  notifText: { flex: 1, minWidth: 0 },
  notifLabel: { ...type.subhead, color: ink.primary },
  notifHint: { ...type.caption, color: ink.muted, marginTop: 1 },
  hairline: { height: 1, backgroundColor: line.hairline, marginHorizontal: space.lg },
  footerInner: { gap: space.xs },
  saveHint: { ...type.caption, fontFamily: fonts.semiBold, color: ink.muted, textAlign: 'center' },
});
