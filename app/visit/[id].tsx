import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { accent, danger, glass, ink, radius, shadow, surface, warn } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppModal } from '../../components/AppModal';
import { Toggle } from '../../components/Toggle';
import { PetAvatar } from '../../components/PetAvatar';
import { Card, ListRow, Screen, SectionLabel } from '../../components/ui';
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
 * Visit details (design v2) — read-only view of one visit, opened from "See visit details" or a
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
      <Screen edges={['top']}>
        <ScreenHeader title="Visit" fallback="/(tabs)/appointments" />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="calendar" size={20} color={accent.ink} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>Visit not found</Text>
          <Text style={styles.emptyBody}>It may have been deleted.</Text>
        </View>
      </Screen>
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
    <Screen edges={['top', 'bottom']}>
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
          <View style={[styles.status, styles.statusAccent]}>
            <Icon name="check" size={17} color={accent.ink} strokeWidth={2} />
            <Text style={[styles.statusText, { color: accent.ink }]}>
              Done · marked <Text style={styles.mono}>{formatApptDate(appt.completedAt!)}</Text>
            </Text>
            <Pressable onPress={undoDone} role="button" aria-label="Undo done" hitSlop={8}>
              <Text style={styles.statusLink}>Undo</Text>
            </Pressable>
          </View>
        ) : late ? (
          <View style={[styles.statusCol, styles.statusWarn]}>
            <View style={styles.statusRow}>
              <Icon name="info" size={17} color={warn.ink} strokeWidth={1.9} />
              <Text style={[styles.statusText, { color: ink.primary }]}>This date has passed</Text>
            </View>
            <Text style={styles.statusBody}>Pick a new day, or mark it done if the visit already happened.</Text>
            <View style={styles.statusActions}>
              <Pressable style={({ pressed }) => [styles.btn, styles.btnInk, pressed && styles.pressed]} onPress={edit} role="button" aria-label="Pick a new date">
                <Icon name="calendar" size={15} color={ink.onDark} strokeWidth={1.9} />
                <Text style={styles.btnInkText}>Pick a new date</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.pressed]} onPress={markDone} role="button" aria-label="Mark as done">
                <Icon name="check" size={15} color={ink.primary} strokeWidth={2} />
                <Text style={styles.btnSecondaryText}>Mark as done</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.status, styles.statusAccent]}>
            <Icon name="clock" size={17} color={accent.ink} strokeWidth={1.9} />
            <Text style={[styles.statusText, styles.mono, { color: accent.ink }]}>{cd.label}</Text>
          </View>
        )}

        {/* Details */}
        <SectionLabel style={styles.sectionGap}>Details</SectionLabel>
        <Card>
          <ListRow icon={meta.icon} iconBg={accent.soft} iconColor={accent.ink} iconLarge title={meta.label} subtitle="Type" showChevron={false} divider />
          <ListRow icon="calendar" iconBg={glass.strong} iconColor={ink.muted} iconLarge title={formatApptDate(appt.startsAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} subtitle="Date" showChevron={false} divider />
          <ListRow icon="clock" iconBg={glass.strong} iconColor={ink.muted} iconLarge title={hasTime ? formatApptTime(appt.startsAt) : 'All day'} subtitle="Time" showChevron={false} divider={!!appt.location} />
          {!!appt.location && (
            <ListRow icon="mapPin" iconBg={glass.strong} iconColor={ink.muted} iconLarge title={appt.location} subtitle="Where" showChevron={false} />
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
                  <PetAvatar pet={p} size={28} emojiSize={15} style={styles.petAvatar} />
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
            <Card style={styles.reminderCard}>
              <View style={styles.reminderIcon}>
                <Icon name="bell" size={17} color={accent.ink} strokeWidth={1.8} />
              </View>
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
            <Icon name="check" size={15} color={ink.primary} strokeWidth={2} />
            <Text style={styles.btnSecondaryText}>Mark as done</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
          onPress={() => setConfirmDelete(true)}
          role="button"
          aria-label="Delete visit"
        >
          <Icon name="trash" size={15} color={danger.primary} strokeWidth={1.8} />
          <Text style={styles.deleteText}>Delete visit</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]} onPress={edit} role="button" aria-label="Edit visit">
          <Icon name="pencil" size={17} color={accent.onAccent} strokeWidth={1.9} />
          <Text style={styles.editText}>Edit visit</Text>
        </Pressable>
      </View>

      <AppModal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmDelete(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Delete this visit?</Text>
            <Text style={styles.dialogBody}>"{appt.title}" will be removed. This can't be undone.</Text>
            <View style={styles.dialogActions}>
              <Pressable style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]} onPress={() => setConfirmDelete(false)} role="button" aria-label="Cancel">
                <Text style={[styles.dialogBtnText, { color: ink.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.pressed]}
                onPress={() => {
                  setConfirmDelete(false);
                  removeAppointment(appt.id);
                  if (router.canGoBack()) router.back();
                  else router.replace('/(tabs)/appointments');
                }}
                role="button"
                aria-label="Delete"
              >
                <Text style={[styles.dialogBtnText, { color: ink.onDark }]}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  pressed: { opacity: 0.75 },
  sectionGap: { marginTop: 24 },
  mono: { fontFamily: fonts.mono },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.tile,
    borderWidth: 1,
  },
  statusAccent: { backgroundColor: accent.soft, borderColor: accent.line },
  statusWarn: { backgroundColor: warn.soft, borderColor: warn.line },
  statusCol: { padding: 14, borderRadius: radius.tile, borderWidth: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { flex: 1, fontSize: 14, fontFamily: fonts.medium },
  statusLink: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },
  statusBody: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 6, lineHeight: 18 },
  statusActions: { flexDirection: 'row', gap: 6, marginTop: 12 },

  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  btnInk: { backgroundColor: ink.primary, borderColor: 'transparent' },
  btnInkText: { fontSize: 13, fontFamily: fonts.medium, color: ink.onDark },
  btnSecondary: { backgroundColor: glass.strong, borderColor: glass.border2 },
  btnSecondaryText: { fontSize: 13.5, fontFamily: fonts.medium, color: ink.primary },
  fullBtn: { flex: 0, marginTop: 24, minHeight: 46 },

  petRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    paddingLeft: 5,
    paddingRight: 13,
    borderRadius: radius.pill,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.border,
  },
  petAvatar: { backgroundColor: accent.soft, borderWidth: 1, borderColor: accent.line },
  petName: { fontSize: 13.5, fontFamily: fonts.medium, color: ink.primary },

  reminderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 14 },
  reminderIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTitle: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  reminderSub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  notes: { fontSize: 14, fontFamily: fonts.regular, color: ink.primary, lineHeight: 21 },

  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, minHeight: 44 },
  deleteText: { fontSize: 14, fontFamily: fonts.medium, color: danger.primary },

  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: glass.border },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
    ...shadow.fab,
  },
  editText: { fontSize: 15, fontFamily: fonts.medium, color: accent.onAccent },

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
  deleteBtn: { backgroundColor: danger.primary, borderColor: 'transparent' },
  dialogBtnText: { fontSize: 14, fontFamily: fonts.medium },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 6 },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: fonts.medium, color: ink.primary },
  emptyBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center' },
});
