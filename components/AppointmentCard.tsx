import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ink, line, radius, space, surface, tones } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import { Button, Card, IconButton, Pill } from './ui';
import { Icon } from './Icon';
import { AppModal } from './AppModal';
import { Toggle } from './Toggle';
import { PetAvatar } from './PetAvatar';
import { computeCountdown, formatApptDate, formatApptTime } from '../lib/appointmentUtils';
import { useAppointments } from '../context/AppointmentsContext';
import { usePets } from '../context/PetsContext';
import type { Appointment } from '../data/mockData';
import { allDayToHasTime } from '../lib/db/models';
import { friendlyIn, joinNames } from '../lib/petVoice';
import { APPT_TYPE_META, dateTileParts } from './appointments/apptMeta';

const MINUTES_PER_DAY = 24 * 60;

/**
 * One visit, pet first: a calendar date tile, the title and type, who is
 * going (avatars + names), a friendly countdown, where, and what to bring.
 * Tap anywhere to open it; the trash chip (or a long press) removes it.
 */
export function AppointmentCard({ appt, now: nowProp }: { appt: Appointment; now?: Date }) {
  const { updateAppointment, removeAppointment } = useAppointments();
  const { pets } = usePets();
  const [pendingDelete, setPendingDelete] = useState(false);
  const meta = APPT_TYPE_META[appt.type];
  const t = tones[meta.tone];
  const now = nowProp ?? new Date();
  // Computed at render so the badge stays live (the screen passes a useNow tick).
  const cd = computeCountdown(appt.startsAt, now.getTime());
  const overdue = cd.kind === 'overdue';
  const reminderOn = appt.reminderOffsetsMinutes.length > 0;
  const hasTime = allDayToHasTime(appt.allDay);
  const tile = dateTileParts(appt.startsAt);

  const apptPets = appt.petIds
    .map((id) => pets.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const whoLine = apptPets.length > 0 ? `For ${joinNames(apptPets.map((p) => p.name))}` : null;

  // Friendly countdown: same-day visits with a time read "in 2h", else the
  // day bucket from computeCountdown. Past visits are gentle, never "Overdue!".
  const countdownLabel = overdue
    ? 'Needs a new date'
    : cd.label === 'Today' && hasTime && new Date(appt.startsAt).getTime() > now.getTime()
      ? `Today, ${friendlyIn(appt.startsAt, now)}`
      : cd.label === 'Today' || cd.label === 'Tomorrow' || cd.label.startsWith('In ')
        ? cd.label
        : capitalize(friendlyIn(appt.startsAt, now));
  const countdownTone = overdue || cd.kind === 'soon' ? 'attention' : 'pet';

  // Honest sub-line: the toggle is "on" for ANY saved reminder, so say which.
  const reminderSub = !reminderOn
    ? 'Reminder is off'
    : appt.reminderOffsetsMinutes.includes(MINUTES_PER_DAY)
      ? "We'll give you a nudge"
      : `We'll nudge you ${describeOffsets(appt.reminderOffsetsMinutes)}`;

  const whenLine = `${formatApptDate(appt.startsAt)} · ${hasTime ? formatApptTime(appt.startsAt) : 'All day'}`;

  const openEdit = () => {
    router.push({ pathname: '/add-appointment', params: { apptId: appt.id } });
  };

  const confirmDelete = () => {
    setPendingDelete(false);
    removeAppointment(appt.id);
  };

  const toggleReminder = () => {
    updateAppointment(appt.id, { reminderOffsetsMinutes: reminderOn ? [] : [MINUTES_PER_DAY] });
  };

  return (
    <Card style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.body, pressed && styles.cardPressed]}
        onPress={openEdit}
        onLongPress={() => setPendingDelete(true)}
        role="button"
        aria-label={`${appt.title}, ${meta.label}${whoLine ? `, ${whoLine}` : ''}, ${whenLine}, ${countdownLabel}`}
        accessibilityHint="Opens the visit to edit. Long press to delete."
      >
        <View style={styles.topRow}>
          <View style={[styles.dateTile, { backgroundColor: t.bg, borderColor: t.border }]}>
            <Text style={[styles.dateMonth, { color: t.ink }]}>{tile.month}</Text>
            <Text style={[styles.dateDay, { color: t.ink }]}>{tile.day}</Text>
            <Text style={[styles.dateWeekday, { color: t.ink }]}>{tile.weekday}</Text>
          </View>
          <View style={styles.headText}>
            <View style={styles.typeRow}>
              <Icon name={meta.icon} size={15} color={t.ink} strokeWidth={2.2} />
              <Text numberOfLines={1} style={[styles.typeLabel, { color: t.ink }]}>
                {meta.label}
              </Text>
            </View>
            <Text numberOfLines={2} style={styles.title}>
              {appt.title}
            </Text>
            <Pill
              tone={countdownTone}
              icon={overdue ? 'info' : 'clock'}
              label={countdownLabel}
              size="sm"
              style={styles.countdown}
            />
          </View>
        </View>

        {apptPets.length > 0 && (
          <View style={styles.petRow}>
            <View style={styles.avatarStack}>
              {apptPets.slice(0, 3).map((p, i) => (
                <PetAvatar
                  key={p.id}
                  pet={p}
                  size={32}
                  emojiSize={17}
                  ring
                  style={i > 0 ? styles.avatarOverlap : undefined}
                />
              ))}
            </View>
            <Text numberOfLines={1} style={styles.whoText}>
              {whoLine}
            </Text>
          </View>
        )}

        <View style={styles.details}>
          <DetailLine icon="calendar" text={whenLine} />
          {!!appt.location && <DetailLine icon="mapPin" text={appt.location} />}
          {!!appt.notes && <DetailLine icon="info" text={appt.notes} label="Notes" lines={2} />}
        </View>
      </Pressable>

      <IconButton
        icon="trash"
        variant="plain"
        accessibilityLabel={`Delete ${appt.title}`}
        onPress={() => setPendingDelete(true)}
        style={styles.trash}
      />

      {overdue ? (
        <View style={[styles.footer, styles.footerStack, { backgroundColor: tones.attention.bg, borderColor: tones.attention.border }]}>
          <Text style={[styles.footerText, { color: tones.attention.ink }]}>
            This date has passed. Pick a new one when you're ready.
          </Text>
          <Button
            label="Pick a new date"
            icon="calendar"
            tone="attention"
            variant="soft"
            size="md"
            onPress={openEdit}
            accessibilityLabel={`Reschedule ${appt.title}`}
            style={styles.rescheduleBtn}
          />
        </View>
      ) : (
        <View style={styles.footer}>
          <View style={styles.footerLabel}>
            <Icon name="bell" size={18} color={reminderOn ? tones.pet.ink : ink.muted} strokeWidth={2} />
            <View style={styles.footerTextWrap}>
              <Text style={styles.footerText}>
                {reminderOn && !appt.reminderOffsetsMinutes.includes(MINUTES_PER_DAY)
                  ? 'Reminder is on'
                  : 'Remind me the day before'}
              </Text>
              <Text style={styles.footerSub}>{reminderSub}</Text>
            </View>
          </View>
          <Toggle on={reminderOn} onToggle={toggleReminder} aria-label="Remind me 1 day before" />
        </View>
      )}

      <AppModal
        visible={pendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPendingDelete(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle} role="heading">
              Remove this visit?
            </Text>
            <Text style={styles.dialogBody}>
              "{appt.title}" will be removed from your schedule. This can't be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Button
                label="Keep it"
                variant="secondary"
                size="md"
                onPress={() => setPendingDelete(false)}
                accessibilityLabel="Cancel"
                style={styles.dialogBtn}
              />
              <Button
                label="Delete"
                icon="trash"
                tone="neutral"
                size="md"
                haptic={false}
                onPress={confirmDelete}
                accessibilityLabel={`Delete ${appt.title}`}
                style={styles.dialogBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </Card>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "a week before" / "2 hours before" / "a week and 2 hours before". */
function describeOffsets(offsets: number[]): string {
  const parts = [...offsets]
    .sort((a, b) => b - a)
    .map((m) => {
      if (m % (7 * MINUTES_PER_DAY) === 0) {
        const w = m / (7 * MINUTES_PER_DAY);
        return w === 1 ? 'a week' : `${w} weeks`;
      }
      if (m % MINUTES_PER_DAY === 0) {
        const d = m / MINUTES_PER_DAY;
        return d === 1 ? 'a day' : `${d} days`;
      }
      if (m % 60 === 0) {
        const h = m / 60;
        return h === 1 ? 'an hour' : `${h} hours`;
      }
      return `${m} min`;
    });
  return `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]} before`;
}

function DetailLine({
  icon,
  text,
  label,
  lines = 1,
}: {
  icon: 'calendar' | 'mapPin' | 'info';
  text: string;
  label?: string;
  lines?: number;
}) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailIcon}>
        <Icon name={icon} size={16} color={ink.muted} strokeWidth={2} />
      </View>
      <Text numberOfLines={lines} style={styles.detailText}>
        {label ? <Text style={styles.detailLabel}>{label}: </Text> : null}
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.sm },
  cardPressed: { opacity: 0.9 },
  body: { padding: space.lg, paddingBottom: space.sm },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingRight: 36 },
  dateTile: {
    width: 60,
    borderRadius: radius.tile,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 8,
    flexShrink: 0,
  },
  dateMonth: { ...type.caption, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  dateDay: { fontFamily: fonts.extraBold, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
  dateWeekday: { ...type.caption, fontSize: 12 },
  headText: { flex: 1, minWidth: 0 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeLabel: { ...type.caption, fontFamily: fonts.bold },
  title: { ...type.subhead, fontSize: 17, lineHeight: 22, fontFamily: fonts.extraBold, color: ink.primary, marginTop: 2 },
  countdown: { marginTop: space.xs },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarOverlap: { marginLeft: -10 },
  whoText: { ...type.bodySm, fontFamily: fonts.bold, color: tones.pet.ink, flexShrink: 1 },
  details: { marginTop: space.sm, gap: 6 },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  detailIcon: { paddingTop: 2 },
  detailText: { ...type.bodySm, color: ink.primary, flex: 1 },
  detailLabel: { fontFamily: fonts.bold, color: ink.muted },
  trash: { position: 'absolute', top: 6, right: 6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.xs,
    minHeight: 56,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    marginHorizontal: space.sm,
    marginBottom: space.sm,
    backgroundColor: surface.field,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: line.hairline,
  },
  footerLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 },
  footerTextWrap: { flex: 1, minWidth: 0 },
  footerText: { ...type.bodySm, fontFamily: fonts.bold, color: ink.primary, flexShrink: 1 },
  footerSub: { ...type.caption, color: ink.muted },
  footerStack: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: space.sm },
  rescheduleBtn: { alignSelf: 'stretch' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(42,39,36,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: space.xl,
    borderWidth: 1,
    borderColor: line.hairline,
  },
  dialogTitle: { ...type.heading, fontSize: 19, color: ink.primary, marginBottom: space.xs },
  dialogBody: { ...type.body, color: ink.muted, marginBottom: space.xl },
  dialogActions: { flexDirection: 'row', gap: space.sm },
  dialogBtn: { flex: 1 },
});
