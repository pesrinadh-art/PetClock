import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { amber, green, ink, line, radius, shadow, surface, terracotta } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppModal } from '../../components/AppModal';
import { Toggle } from '../../components/Toggle';
import { PetAvatar } from '../../components/PetAvatar';
import { Card, ListRow, Pill, SectionLabel } from '../../components/ui';
import { useAppointments } from '../../context/AppointmentsContext';
import { usePets } from '../../context/PetsContext';
import { useNow } from '../../hooks/useNow';
import { computeCountdown, formatApptDate, formatApptTime } from '../../lib/appointmentUtils';
import { needsNewDate, VISIT_META } from '../../lib/visits';
import { joinPetNames } from '../../lib/petNames';
import { allDayToHasTime } from '../../lib/db/models';

const MINUTES_PER_DAY = 24 * 60;

/** "1 week before · 1 day before · 2 hours before" for the reminder offsets. */
function describeOffsets(offsets: number[]): string {
  if (offsets.length === 0) return 'Off';
  return [...offsets]
    .sort((a, b) => b - a)
    .map((m) => {
      if (m % (7 * MINUTES_PER_DAY) === 0) return `${m / (7 * MINUTES_PER_DAY)} week${m === 7 * MINUTES_PER_DAY ? '' : 's'} before`;
      if (m % MINUTES_PER_DAY === 0) return `${m / MINUTES_PER_DAY} day${m === MINUTES_PER_DAY ? '' : 's'} before`;
      if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'} before`;
      return `${m} min before`;
    })
    .join(' · ');
}

/**
 * Visit details (redesign v3) — read-only view of one visit, opened from "See visit details" or a
 * visit card. Offers Edit, Delete, a reminder toggle, and — for a visit whose date passed — pick a
 * new date or mark it done. A done visit can be reopened ("Undo").
 */
export default function VisitDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { appointments, updateAppointment, removeAppointment } = useAppointments();
  const { pets } = usePets();
  const now = useNow();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const appt = appointments.find((a) => a.id === id && !a.deletedAt) ?? null;

  if (!appt) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Visit" fallback="/(tabs)/appointments" />
        <View style={styles.empty}>
          <Icon name="calendar" size={40} color={ink.faint} />
          <Text style={styles.emptyTitle}>Visit not found</Text>
          <Text style={styles.emptyBody}>It may have been deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const meta = VISIT_META[appt.type];
  const apptPets = pets.filter((p) => appt.petIds.includes(p.id));
  const done = appt.completedAt != null;
  const late = needsNewDate(appt, now.getTime());
  const hasTime = allDayToHasTime(appt.allDay);
  const reminderOn = appt.reminderOffsetsMinutes.length > 0;
  const cd = computeCountdown(appt.startsAt, now.getTime());

  const edit = () => router.push({ pathname: '/add-appointment', params: { apptId: appt.id } });
  const markDone = () => updateAppointment(appt.id, { completedAt: new Date().toISOString() });
  const undoDone = () => updateAppointment(appt.id, { completedAt: null });
  const toggleReminder = () =>
    updateAppointment(appt.id, { reminderOffsetsMinutes: reminderOn ? [] : [MINUTES_PER_DAY] });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title={appt.title}
        subtitle={`${meta.label}${apptPets.length ? ` · For ${joinPetNames(apptPets.map((p) => p.name))}` : ''}`}
        onEdit={edit}
        editLabel={`Edit ${appt.title}`}
        fallback="/(tabs)/appointments"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Status */}
        {done ? (
          <View style={[styles.status, { backgroundColor: green.tint, borderColor: green.tintBorder }]}>
            <Icon name="check" size={18} color={green.primary} strokeWidth={2.6} />
            <Text style={[styles.statusText, { color: green.primary }]}>
              Done · marked {formatApptDate(appt.completedAt!)}
            </Text>
            <Pressable onPress={undoDone} role="button" aria-label="Undo done" hitSlop={8}>
              <Text style={styles.statusLink}>Undo</Text>
            </Pressable>
          </View>
        ) : late ? (
          <View style={[styles.statusCol, { backgroundColor: amber.warnBg, borderColor: '#f3dfb9' }]}>
            <View style={styles.statusRow}>
              <Icon name="info" size={18} color={amber.warnInk} strokeWidth={2.2} />
              <Text style={[styles.statusText, { color: amber.warnInk }]}>This date has passed</Text>
            </View>
            <Text style={styles.statusBody}>Pick a new day, or mark it done if the visit already happened.</Text>
            <View style={styles.statusActions}>
              <Pressable style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]} onPress={edit} role="button" aria-label="Pick a new date">
                <Icon name="calendar" size={16} color="#ffffff" strokeWidth={2.2} />
                <Text style={styles.btnPrimaryText}>Pick a new date</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.pressed]} onPress={markDone} role="button" aria-label="Mark as done">
                <Icon name="check" size={16} color={green.primary} strokeWidth={2.6} />
                <Text style={styles.btnSecondaryText}>Mark as done</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.status, { backgroundColor: green.tint, borderColor: green.tintBorder }]}>
            <Icon name="clock" size={18} color={green.primary} strokeWidth={2.2} />
            <Text style={[styles.statusText, { color: green.primary }]}>{cd.label}</Text>
          </View>
        )}

        {/* Details */}
        <SectionLabel style={styles.sectionGap}>Details</SectionLabel>
        <Card>
          <ListRow icon={meta.icon} iconBg={meta.bg} iconColor={meta.ink} iconLarge title={meta.label} subtitle="Type" showChevron={false} divider />
          <ListRow icon="calendar" iconBg={surface.chip} iconColor={ink.primary} iconLarge title={formatApptDate(appt.startsAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} subtitle="Date" showChevron={false} divider />
          <ListRow icon="clock" iconBg={surface.chip} iconColor={ink.primary} iconLarge title={hasTime ? formatApptTime(appt.startsAt) : 'All day'} subtitle="Time" showChevron={false} divider={!!appt.location} />
          {!!appt.location && (
            <ListRow icon="mapPin" iconBg={surface.chip} iconColor={ink.primary} iconLarge title={appt.location} subtitle="Where" showChevron={false} />
          )}
        </Card>

        {/* Who's going */}
        {apptPets.length > 0 && (
          <>
            <SectionLabel style={styles.sectionGap}>Who's going</SectionLabel>
            <View style={styles.petRow}>
              {apptPets.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [styles.petChip, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: '/pet/[id]', params: { id: p.id } })}
                  role="button"
                  aria-label={`Open ${p.name}`}
                >
                  <PetAvatar pet={p} size={30} emojiSize={17} style={{ backgroundColor: green.tint }} />
                  <Text style={styles.petName}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Reminders */}
        {!done && (
          <>
            <SectionLabel style={styles.sectionGap}>Reminders</SectionLabel>
            <Card padded style={styles.reminderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>{reminderOn ? describeOffsets(appt.reminderOffsetsMinutes) : 'No reminders'}</Text>
                <Text style={styles.reminderSub}>{reminderOn ? 'We\'ll nudge everyone caring for them.' : 'Turn on for a nudge a day before.'}</Text>
              </View>
              <Toggle on={reminderOn} onToggle={toggleReminder} aria-label="Visit reminders" />
            </Card>
          </>
        )}

        {/* Notes */}
        {!!appt.notes && (
          <>
            <SectionLabel style={styles.sectionGap}>Notes</SectionLabel>
            <Card padded>
              <Text style={styles.notes}>{appt.notes}</Text>
            </Card>
          </>
        )}

        {!done && !late && (
          <Pressable style={({ pressed }) => [styles.btn, styles.btnSecondary, styles.fullBtn, pressed && styles.pressed]} onPress={markDone} role="button" aria-label="Mark as done">
            <Icon name="check" size={16} color={green.primary} strokeWidth={2.6} />
            <Text style={styles.btnSecondaryText}>Mark as done</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
          onPress={() => setConfirmDelete(true)}
          role="button"
          aria-label="Delete visit"
        >
          <Icon name="trash" size={16} color={terracotta.primary} strokeWidth={2} />
          <Text style={styles.deleteText}>Delete visit</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]} onPress={edit} role="button" aria-label="Edit visit">
          <Icon name="pencil" size={18} color="#ffffff" strokeWidth={2.2} />
          <Text style={styles.editText}>Edit visit</Text>
        </Pressable>
      </View>

      <AppModal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmDelete(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Delete this visit?</Text>
            <Text style={styles.dialogBody}>"{appt.title}" will be removed. This can't be undone.</Text>
            <View style={styles.dialogActions}>
              <Pressable style={({ pressed }) => [styles.dialogBtn, { backgroundColor: green.tint }, pressed && styles.pressed]} onPress={() => setConfirmDelete(false)} role="button" aria-label="Cancel">
                <Text style={[styles.dialogBtnText, { color: green.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, { backgroundColor: terracotta.primary }, pressed && styles.pressed]}
                onPress={() => {
                  setConfirmDelete(false);
                  removeAppointment(appt.id);
                  if (router.canGoBack()) router.back();
                  else router.replace('/(tabs)/appointments');
                }}
                role="button"
                aria-label="Delete"
              >
                <Text style={[styles.dialogBtnText, { color: '#ffffff' }]}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  pressed: { opacity: 0.8 },
  sectionGap: { marginTop: 24 },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  statusCol: { padding: 14, borderRadius: radius.card, borderWidth: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { flex: 1, fontSize: 15, fontFamily: fonts.bold },
  statusLink: { fontSize: 13.5, fontFamily: fonts.bold, color: green.primary },
  statusBody: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 6, lineHeight: 18 },
  statusActions: { flexDirection: 'row', gap: 8, marginTop: 12 },

  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.tile,
  },
  btnPrimary: { backgroundColor: green.mid },
  btnPrimaryText: { fontSize: 13.5, fontFamily: fonts.bold, color: '#ffffff' },
  btnSecondary: { backgroundColor: surface.card, borderWidth: 1.5, borderColor: line.border },
  btnSecondaryText: { fontSize: 13.5, fontFamily: fonts.bold, color: green.primary },
  fullBtn: { flex: 0, marginTop: 24, paddingVertical: 14 },

  petRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: surface.card,
    borderWidth: 1.5,
    borderColor: line.border,
    ...shadow.sm,
  },
  petName: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },

  reminderCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderTitle: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  reminderSub: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  notes: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary, lineHeight: 20 },

  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, paddingVertical: 10 },
  deleteText: { fontSize: 14, fontFamily: fonts.bold, color: terracotta.primary },

  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: line.border },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.card,
    backgroundColor: green.mid,
    ...shadow.fab,
  },
  editText: { fontSize: 16, fontFamily: fonts.bold, color: '#ffffff' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 320, backgroundColor: surface.card, borderRadius: radius.card, padding: 20 },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.tile, paddingVertical: 12, alignItems: 'center' },
  dialogBtnText: { fontSize: 13, fontFamily: fonts.extraBold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary },
  emptyBody: { fontSize: 13, color: ink.muted, textAlign: 'center' },
});
