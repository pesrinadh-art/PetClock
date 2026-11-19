import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, danger, glass, ink, radius, shadow, surface, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { AppModal } from './AppModal';
import { PetAvatar } from './PetAvatar';
import { computeCountdown, formatApptTime } from '../lib/appointmentUtils';
import { needsNewDate, VISIT_META } from '../lib/visits';
import { joinPetNames } from '../lib/petNames';
import { useAppointments } from '../context/AppointmentsContext';
import { usePets } from '../context/PetsContext';
import type { Appointment } from '../data/mockData';
import { allDayToHasTime } from '../lib/db/models';

/**
 * A visit card (design v2): a glass panel with an accent-soft date tile (SEP / 15 / Tue in Geist
 * Mono), the type ("Vaccine") with its line icon, the title, a mono status pill, and "For Peanut"
 * with the pets' avatars. Tapping opens the visit details; the trash icon deletes after a confirm.
 * A visit whose date has passed carries "Needs a new date" plus two quick actions: pick a new
 * date, or mark it done.
 */
export function AppointmentCard({ appt }: { appt: Appointment }) {
  const { updateAppointment, removeAppointment } = useAppointments();
  const { pets } = usePets();
  const [pendingDelete, setPendingDelete] = useState(false);
  const meta = VISIT_META[appt.type];
  const overdue = needsNewDate(appt);
  const cd = computeCountdown(appt.startsAt);
  const hasTime = allDayToHasTime(appt.allDay);
  const d = new Date(appt.startsAt);
  const soon = cd.kind === 'soon';

  const apptPets = appt.petIds
    .map((id) => pets.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const openDetails = () => router.push({ pathname: '/visit/[id]', params: { id: appt.id } });
  const reschedule = () => router.push({ pathname: '/add-appointment', params: { apptId: appt.id } });
  const markDone = () => updateAppointment(appt.id, { completedAt: new Date().toISOString() });

  const tileInk = overdue ? warn.ink : accent.ink;

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.body, pressed && styles.cardPressed]}
        onPress={openDetails}
        role="button"
        aria-label={`${appt.title}, ${meta.label}, ${overdue ? 'needs a new date' : cd.label}`}
        accessibilityHint="Opens the visit details."
      >
        <View style={[styles.dateTile, overdue && styles.dateTileLate]}>
          <Text style={[styles.dateMonth, { color: tileInk }]}>
            {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
          </Text>
          <Text style={[styles.dateDay, { color: tileInk }]}>{d.getDate()}</Text>
          <Text style={[styles.dateWeekday, { color: tileInk }]}>
            {d.toLocaleDateString('en-US', { weekday: 'short' })}
          </Text>
        </View>

        <View style={styles.main}>
          <View style={styles.typeRow}>
            <Icon name={meta.icon} size={14} color={accent.ink} strokeWidth={1.8} />
            <Text style={styles.typeLabel}>{meta.label}</Text>
          </View>
          <Text numberOfLines={2} style={styles.title}>
            {appt.title}
          </Text>
          {overdue ? (
            <View style={[styles.pill, styles.pillWarn]}>
              <Icon name="info" size={11} color={warn.ink} strokeWidth={2} />
              <Text style={[styles.pillText, { color: warn.ink }]}>Needs a new date</Text>
            </View>
          ) : (
            <View style={[styles.pill, soon ? styles.pillWarn : styles.pillAccent]}>
              <Text style={[styles.pillText, { color: soon ? warn.ink : accent.ink }]}>
                {hasTime ? `${cd.label} · ${formatApptTime(appt.startsAt)}` : `${cd.label} · All day`}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* Sibling of the card body (not nested) so it is its own button. */}
      <Pressable
        style={({ pressed }) => [styles.trash, pressed && styles.pressed]}
        onPress={() => setPendingDelete(true)}
        role="button"
        aria-label={`Delete ${appt.title}`}
        hitSlop={8}
      >
        <Icon name="trash" size={17} color={ink.muted} strokeWidth={1.8} />
      </Pressable>

      {apptPets.length > 0 && (
        <View style={styles.forRow}>
          <View style={styles.avatars}>
            {apptPets.slice(0, 4).map((p, i) => (
              <PetAvatar key={p.id} pet={p} size={24} emojiSize={13} style={[styles.forAvatar, i > 0 && { marginLeft: -7 }]} />
            ))}
          </View>
          <Text numberOfLines={1} style={styles.forText}>
            For {joinPetNames(apptPets.map((p) => p.name))}
          </Text>
        </View>
      )}

      {overdue && (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}
            onPress={reschedule}
            role="button"
            aria-label={`Pick a new date for ${appt.title}`}
          >
            <Icon name="calendar" size={15} color={ink.onDark} strokeWidth={1.9} />
            <Text style={styles.actionPrimaryText}>Pick a new date</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionSecondary, pressed && styles.pressed]}
            onPress={markDone}
            role="button"
            aria-label={`Mark ${appt.title} as done`}
          >
            <Icon name="check" size={15} color={ink.primary} strokeWidth={2} />
            <Text style={styles.actionSecondaryText}>Mark as done</Text>
          </Pressable>
        </View>
      )}

      <AppModal visible={pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(false)}>
        <Pressable style={styles.overlay} onPress={() => setPendingDelete(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Delete this visit?</Text>
            <Text style={styles.dialogBody}>"{appt.title}" will be removed. This can't be undone.</Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setPendingDelete(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.pressed]}
                onPress={() => {
                  setPendingDelete(false);
                  removeAppointment(appt.id);
                }}
                role="button"
                aria-label={`Delete ${appt.title}`}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: glass.border,
    marginBottom: 10,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.7 },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, paddingRight: 48 },
  dateTile: {
    width: 58,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderColor: accent.line,
    alignItems: 'center',
  },
  dateTileLate: { backgroundColor: warn.soft, borderColor: warn.line },
  dateMonth: { fontSize: 10.5, fontFamily: fonts.mono, letterSpacing: 0.8 },
  dateDay: { fontSize: 22, fontFamily: fonts.mono, lineHeight: 28, letterSpacing: -0.5 },
  dateWeekday: { fontSize: 11, fontFamily: fonts.monoRegular },
  main: { flex: 1 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeLabel: { fontSize: 12, fontFamily: fonts.regular, color: accent.ink },
  title: { fontSize: 16, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.35, marginTop: 3, lineHeight: 21 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    height: 24,
    paddingHorizontal: 9,
    marginTop: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillAccent: { backgroundColor: accent.soft, borderColor: accent.line },
  pillWarn: { backgroundColor: warn.soft, borderColor: warn.line },
  pillText: { fontSize: 11, fontFamily: fonts.mono },
  trash: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  forRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 13,
    borderTopWidth: 1,
    borderTopColor: glass.border,
  },
  avatars: { flexDirection: 'row' },
  forAvatar: { backgroundColor: accent.soft, borderWidth: 1.5, borderColor: glass.strong },
  forText: { flex: 1, fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted },

  actions: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actionPrimary: { backgroundColor: ink.primary, borderColor: 'transparent' },
  actionPrimaryText: { fontSize: 13, fontFamily: fonts.medium, color: ink.onDark },
  actionSecondary: { backgroundColor: glass.strong, borderColor: glass.border2 },
  actionSecondaryText: { fontSize: 13, fontFamily: fonts.medium, color: ink.primary },
  pressed: { opacity: 0.7 },

  overlay: { flex: 1, backgroundColor: glass.scrimDark, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: surface.solid,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: glass.border,
    padding: 20,
    ...shadow.hero,
  },
  dialogTitle: { fontSize: 17, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.4, marginBottom: 6 },
  dialogBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 8 },
  dialogBtn: { flex: 1, borderRadius: radius.pill, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cancelBtn: { backgroundColor: glass.strong, borderColor: glass.border2 },
  cancelBtnText: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  deleteBtn: { backgroundColor: danger.primary, borderColor: 'transparent' },
  deleteBtnText: { fontSize: 14, fontFamily: fonts.medium, color: ink.onDark },
});
