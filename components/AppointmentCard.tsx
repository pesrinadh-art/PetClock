import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, green, ink, line, radius, shadow, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Pill } from './ui';
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
 * A visit card (redesign v3): a date tile (SEP / 15 / Tue), the type ("Vaccine") with its icon,
 * the title, a status pill, and "For Peanut" with the pets' avatars. Tapping opens the visit
 * details; the trash icon deletes after a confirm. A visit whose date has passed carries
 * "Needs a new date" plus two quick actions: pick a new date, or mark it done.
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

  const apptPets = appt.petIds
    .map((id) => pets.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const openDetails = () => router.push({ pathname: '/visit/[id]', params: { id: appt.id } });
  const reschedule = () => router.push({ pathname: '/add-appointment', params: { apptId: appt.id } });
  const markDone = () => updateAppointment(appt.id, { completedAt: new Date().toISOString() });

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
          <Text style={styles.dateMonth}>{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</Text>
          <Text style={styles.dateDay}>{d.getDate()}</Text>
          <Text style={styles.dateWeekday}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
        </View>

        <View style={styles.main}>
          <View style={styles.typeRow}>
            <Icon name={meta.icon} size={15} color={meta.ink} strokeWidth={2} />
            <Text style={[styles.typeLabel, { color: meta.ink }]}>{meta.label}</Text>
          </View>
          <Text numberOfLines={2} style={styles.title}>
            {appt.title}
          </Text>
          {overdue ? (
            <Pill
              label="Needs a new date"
              bg={amber.warnBg}
              color={amber.warnInk}
              size="sm"
              icon={<Icon name="info" size={12} color={amber.warnInk} strokeWidth={2.4} />}
              style={styles.pill}
            />
          ) : (
            <Pill
              label={hasTime ? `${cd.label} · ${formatApptTime(appt.startsAt)}` : `${cd.label} · All day`}
              bg={cd.kind === 'soon' ? amber.warnBg : green.tint}
              color={cd.kind === 'soon' ? amber.warnInk : green.primary}
              size="sm"
              style={styles.pill}
            />
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
        <Icon name="trash" size={19} color={ink.primary} strokeWidth={2} />
      </Pressable>

      {apptPets.length > 0 && (
        <View style={styles.forRow}>
          <View style={styles.avatars}>
            {apptPets.slice(0, 4).map((p, i) => (
              <PetAvatar key={p.id} pet={p} size={26} emojiSize={14} style={[styles.forAvatar, i > 0 && { marginLeft: -8 }]} />
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
            <Icon name="calendar" size={15} color="#ffffff" strokeWidth={2.2} />
            <Text style={styles.actionPrimaryText}>Pick a new date</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionSecondary, pressed && styles.pressed]}
            onPress={markDone}
            role="button"
            aria-label={`Mark ${appt.title} as done`}
          >
            <Icon name="check" size={15} color={green.primary} strokeWidth={2.6} />
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
    marginBottom: 12,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.85 },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, paddingRight: 48 },
  dateTile: {
    width: 62,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#e9f4f1',
    borderWidth: 1,
    borderColor: '#cfe5de',
    alignItems: 'center',
  },
  dateTileLate: { backgroundColor: '#eef4f2' },
  dateMonth: { fontSize: 11, fontFamily: fonts.bold, color: green.primary, letterSpacing: 1 },
  dateDay: { fontSize: 25, fontFamily: fonts.extraBold, color: green.primary, lineHeight: 30 },
  dateWeekday: { fontSize: 11.5, fontFamily: fonts.semiBold, color: green.primary },
  main: { flex: 1 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeLabel: { fontSize: 12.5, fontFamily: fonts.bold },
  title: { fontSize: 17, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.3, marginTop: 3 },
  pill: { alignSelf: 'flex-start', marginTop: 8 },
  trash: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  forRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: line.hairline,
  },
  avatars: { flexDirection: 'row' },
  forAvatar: { backgroundColor: green.tint, borderWidth: 2, borderColor: '#ffffff' },
  forText: { flex: 1, fontSize: 13, fontFamily: fonts.bold, color: ink.primary },

  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.tile,
  },
  actionPrimary: { backgroundColor: green.mid },
  actionPrimaryText: { fontSize: 13, fontFamily: fonts.bold, color: '#ffffff' },
  actionSecondary: { backgroundColor: surface.card, borderWidth: 1.5, borderColor: line.border },
  actionSecondaryText: { fontSize: 13, fontFamily: fonts.bold, color: green.primary },
  pressed: { opacity: 0.75 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 320, backgroundColor: surface.card, borderRadius: radius.card, padding: 20 },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.tile, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: green.tint },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: green.primary },
  deleteBtn: { backgroundColor: terracotta.primary },
  deleteBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: ink.onDark },
});
