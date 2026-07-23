import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { AppModal } from './AppModal';
import { Toggle } from './Toggle';
import { computeCountdown, formatApptDate, formatApptTime } from '../lib/appointmentUtils';
import { useAppointments } from '../context/AppointmentsContext';
import { usePets } from '../context/PetsContext';
import type { Appointment, ApptType } from '../data/mockData';

const TYPE_META: Record<ApptType, { label: string; icon: string; accent: string; badgeBg: string }> = {
  vet: { label: 'Vet Visit', icon: '🏥', accent: colors.apptVet, badgeBg: colors.apptVetLight },
  groom: { label: 'Grooming', icon: '✂️', accent: colors.apptGroom, badgeBg: colors.apptGroomLight },
  vaccine: { label: 'Vaccine', icon: '💉', accent: colors.apptVaccine, badgeBg: colors.apptVaccineLight },
  other: { label: 'Other', icon: '📌', accent: colors.apptOther, badgeBg: colors.apptOtherLight },
};

const COUNTDOWN_STYLE = {
  soon: { bg: '#FFF8DB', color: '#B8900A' },
  upcoming: { bg: colors.sagePale, color: colors.sage },
  overdue: { bg: '#FDECEA', color: '#C0392B' },
};

const MINUTES_PER_DAY = 24 * 60;

export function AppointmentCard({ appt }: { appt: Appointment }) {
  const { updateAppointment, removeAppointment } = useAppointments();
  const { pets } = usePets();
  const [pendingDelete, setPendingDelete] = useState(false);
  const meta = TYPE_META[appt.type];
  // Computed at render so the badge stays live; integrates with a useNow tick at merge.
  const cd = computeCountdown(appt.dateTime);
  const countdown = COUNTDOWN_STYLE[cd.kind];
  const overdue = cd.kind === 'overdue';
  const reminderOn = appt.reminderOffsets.length > 0;

  const apptPets = appt.petIds
    .map((id) => pets.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const openEdit = () => {
    router.push({ pathname: '/add-appointment', params: { apptId: appt.id } });
  };

  const confirmDelete = () => {
    setPendingDelete(false);
    removeAppointment(appt.id);
  };

  const toggleReminder = () => {
    updateAppointment(appt.id, { reminderOffsets: reminderOn ? [] : [MINUTES_PER_DAY] });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={openEdit}
      onLongPress={() => setPendingDelete(true)}
      role="button"
      aria-label={`${appt.title}, ${meta.label}, ${cd.label}`}
      accessibilityHint="Opens the appointment to edit. Long press to delete."
    >
      <View style={[styles.accent, { backgroundColor: meta.accent }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: meta.badgeBg }]}>
            <Text style={[styles.badgeText, { color: meta.accent }]}>
              {meta.icon} {meta.label}
            </Text>
          </View>
          <View style={[styles.countdown, { backgroundColor: countdown.bg }]}>
            <Text style={[styles.countdownText, { color: countdown.color }]}>{cd.label}</Text>
          </View>
        </View>

        <Text style={styles.title}>{appt.title}</Text>
        <View style={styles.petRow}>
          {apptPets.map((p) => (
            <View key={p.id} style={styles.petChip}>
              <Text style={styles.petChipText}>{p.avatar} {p.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.detail}>📅 {formatApptDate(appt.dateTime)}</Text>
          {appt.hasTime && <Text style={styles.detail}>🕐 {formatApptTime(appt.dateTime)}</Text>}
          {appt.location && <Text style={styles.detail}>📍 {appt.location}</Text>}
        </View>

        {overdue ? (
          <Pressable
            style={({ pressed }) => [styles.notifRow, { backgroundColor: '#FDECEA' }, pressed && styles.pressed]}
            onPress={openEdit}
            role="button"
            aria-label={`Reschedule ${appt.title}`}
          >
            <Text style={[styles.notifText, { color: '#C0392B' }]}>🔴 Reschedule soon</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.extraBold, color: colors.apptVet }}>Reschedule ›</Text>
          </Pressable>
        ) : (
          <View style={styles.notifRow}>
            <Text style={styles.notifText}>🔔 Remind me 1 day before</Text>
            <Toggle on={reminderOn} onToggle={toggleReminder} aria-label="Remind me 1 day before" />
          </View>
        )}
      </View>

      <AppModal
        visible={pendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPendingDelete(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Delete appointment?</Text>
            <Text style={styles.dialogBody}>"{appt.title}" will be removed. This can't be undone.</Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.dialogPressed]}
                onPress={() => setPendingDelete(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.dialogPressed]}
                onPress={confirmDelete}
                role="button"
                aria-label={`Delete ${appt.title}`}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: 12, overflow: 'hidden', ...shadow.sm },
  cardPressed: { opacity: 0.9 },
  accent: { height: 4 },
  body: { padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99 },
  badgeText: { fontSize: 11, fontFamily: fonts.extraBold },
  countdown: { marginLeft: 'auto', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99 },
  countdownText: { fontSize: 11, fontFamily: fonts.extraBold },
  title: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 6 },
  petRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  petChip: { backgroundColor: colors.sagePale, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 99 },
  petChipText: { fontSize: 11, fontFamily: fonts.bold, color: colors.sage },
  detailsRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginBottom: 10 },
  detail: { fontSize: 12, color: colors.stoneMid, fontFamily: fonts.semiBold },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.sagePale,
    borderRadius: radius.sm,
  },
  notifText: { fontSize: 12, fontFamily: fonts.bold, color: colors.stone },
  pressed: { opacity: 0.75 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow.card,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: colors.stoneMid, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  dialogPressed: { opacity: 0.8 },
  cancelBtn: { backgroundColor: colors.sagePale },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },
  deleteBtn: { backgroundColor: '#C0392B' },
  deleteBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
});
