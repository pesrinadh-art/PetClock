import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, category, green, ink, line, radius, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Card, Pill } from './ui';
import { Icon, type IconName } from './Icon';
import { AppModal } from './AppModal';
import { Toggle } from './Toggle';
import { PetAvatar } from './PetAvatar';
import { computeCountdown, formatApptDate, formatApptTime } from '../lib/appointmentUtils';
import { useAppointments } from '../context/AppointmentsContext';
import { usePets } from '../context/PetsContext';
import type { Appointment, ApptType } from '../data/mockData';
import { allDayToHasTime } from '../lib/db/models';

const TYPE_META: Record<ApptType, { label: string; icon: IconName; ink: string; bg: string }> = {
  vet: { label: 'Vet Visit', icon: 'vet', ink: category.vetInk, bg: category.vetBg },
  groom: { label: 'Grooming', icon: 'scissors', ink: category.groomInk, bg: category.groomBg },
  vaccine: { label: 'Vaccine', icon: 'vaccine', ink: category.vaccineInk, bg: category.vaccineBg },
  other: { label: 'Other', icon: 'dots', ink: category.otherInk, bg: category.otherBg },
};

// Countdown pill palette by urgency, mapped to role tokens (green = upcoming,
// amber = attention/soon, terracotta = overdue).
const COUNTDOWN_STYLE = {
  soon: { bg: amber.warnBg, color: amber.warnInk },
  upcoming: { bg: green.tint, color: green.primary },
  overdue: { bg: terracotta.tint, color: terracotta.primary },
};

const MINUTES_PER_DAY = 24 * 60;

export function AppointmentCard({ appt }: { appt: Appointment }) {
  const { updateAppointment, removeAppointment } = useAppointments();
  const { pets } = usePets();
  const [pendingDelete, setPendingDelete] = useState(false);
  const meta = TYPE_META[appt.type];
  // Computed at render so the badge stays live; integrates with a useNow tick at merge.
  const cd = computeCountdown(appt.startsAt);
  const countdown = COUNTDOWN_STYLE[cd.kind];
  const overdue = cd.kind === 'overdue';
  const reminderOn = appt.reminderOffsetsMinutes.length > 0;
  const hasTime = allDayToHasTime(appt.allDay);

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
    updateAppointment(appt.id, { reminderOffsetsMinutes: reminderOn ? [] : [MINUTES_PER_DAY] });
  };

  return (
    <Card style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.body, pressed && styles.cardPressed]}
        onPress={openEdit}
        onLongPress={() => setPendingDelete(true)}
        role="button"
        aria-label={`${appt.title}, ${meta.label}, ${cd.label}`}
        accessibilityHint="Opens the appointment to edit. Long press to delete."
      >
        <View style={styles.topRow}>
          <View style={[styles.iconTile, { backgroundColor: meta.bg }]}>
            <Icon name={meta.icon} size={18} color={meta.ink} strokeWidth={2} />
          </View>
          <View style={styles.headText}>
            <Text numberOfLines={1} style={styles.title}>{appt.title}</Text>
            <Text numberOfLines={1} style={[styles.typeLabel, { color: meta.ink }]}>{meta.label}</Text>
          </View>
          <Pill label={cd.label} bg={countdown.bg} color={countdown.color} size="sm" />
        </View>

        {apptPets.length > 0 && (
          <View style={styles.petRow}>
            {apptPets.map((p) => (
              <View key={p.id} style={styles.petChip}>
                <PetAvatar pet={p} size={18} emojiSize={12} style={styles.petChipAvatar} />
                <Text numberOfLines={1} style={styles.petChipText}>{p.name}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Icon name="calendar" size={14} color={ink.faint} strokeWidth={2} />
            <Text numberOfLines={1} style={styles.detailText}>{formatApptDate(appt.startsAt)}</Text>
          </View>
          {hasTime && (
            <View style={styles.detail}>
              <Icon name="clock" size={14} color={ink.faint} strokeWidth={2} />
              <Text numberOfLines={1} style={styles.detailText}>{formatApptTime(appt.startsAt)}</Text>
            </View>
          )}
          {appt.location && (
            <View style={[styles.detail, styles.detailLocation]}>
              <Icon name="mapPin" size={14} color={ink.faint} strokeWidth={2} />
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.detailText}>{appt.location}</Text>
            </View>
          )}
        </View>
      </Pressable>

      {overdue ? (
        <Pressable
          style={({ pressed }) => [styles.notifRow, { backgroundColor: terracotta.tint }, pressed && styles.pressed]}
          onPress={openEdit}
          role="button"
          aria-label={`Reschedule ${appt.title}`}
        >
          <View style={styles.notifLabelWrap}>
            <Icon name="alert" size={15} color={terracotta.primary} strokeWidth={2} />
            <Text numberOfLines={1} style={[styles.notifText, { color: terracotta.primary }]}>Reschedule soon</Text>
          </View>
          <Text numberOfLines={1} style={styles.rescheduleCta}>Reschedule ›</Text>
        </Pressable>
      ) : (
        <View style={styles.notifRow}>
          <View style={styles.notifLabelWrap}>
            <Icon name="bell" size={15} color={ink.muted} strokeWidth={2} />
            <Text numberOfLines={1} style={styles.notifText}>Remind me 1 day before</Text>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  cardPressed: { opacity: 0.9 },
  body: { padding: 16, paddingBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headText: { flex: 1 },
  title: { fontSize: 15, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.3 },
  typeLabel: { fontSize: 12, fontFamily: fonts.semiBold, marginTop: 1 },
  petRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: green.tint,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: 999,
  },
  petChipAvatar: { backgroundColor: 'transparent' },
  petChipText: { fontSize: 11, fontFamily: fonts.bold, color: green.primary },
  detailsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 12 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 12.5, color: ink.muted, fontFamily: fonts.medium },
  detailLocation: { flexShrink: 1, maxWidth: '100%' },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: surface.field,
    borderRadius: radius.tile,
  },
  notifLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 },
  notifText: { fontSize: 12.5, fontFamily: fonts.semiBold, color: ink.primary, flexShrink: 1 },
  rescheduleCta: { fontSize: 12, fontFamily: fonts.extraBold, color: category.vetInk, flexShrink: 0 },
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
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: line.hairline,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.tile, paddingVertical: 12, alignItems: 'center' },
  dialogPressed: { opacity: 0.8 },
  cancelBtn: { backgroundColor: green.tint },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: green.primary },
  deleteBtn: { backgroundColor: terracotta.primary },
  deleteBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: ink.onDark },
});
