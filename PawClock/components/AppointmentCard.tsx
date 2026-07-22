import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Toggle } from './Toggle';
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

export function AppointmentCard({ appt }: { appt: Appointment }) {
  const meta = TYPE_META[appt.type];
  const countdown = COUNTDOWN_STYLE[appt.countdown.kind];
  const overdue = appt.countdown.kind === 'overdue';
  const [reminderOn, setReminderOn] = useState(!!appt.reminderEnabled);

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: meta.accent }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: meta.badgeBg }]}>
            <Text style={[styles.badgeText, { color: meta.accent }]}>
              {meta.icon} {meta.label}
            </Text>
          </View>
          <View style={[styles.countdown, { backgroundColor: countdown.bg }]}>
            <Text style={[styles.countdownText, { color: countdown.color }]}>{appt.countdown.label}</Text>
          </View>
        </View>

        <Text style={styles.title}>{appt.title}</Text>
        <View style={styles.petRow}>
          {appt.petNames.map((p) => (
            <View key={p} style={styles.petChip}>
              <Text style={styles.petChipText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.detail}>📅 {appt.date}</Text>
          {appt.time && <Text style={styles.detail}>🕐 {appt.time}</Text>}
          {appt.location && <Text style={styles.detail}>📍 {appt.location}</Text>}
        </View>

        {overdue ? (
          <Pressable style={({ pressed }) => [styles.notifRow, { backgroundColor: '#FDECEA' }, pressed && styles.pressed]}>
            <Text style={[styles.notifText, { color: '#C0392B' }]}>🔴 Reschedule soon</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.extraBold, color: colors.apptVet }}>Reschedule ›</Text>
          </Pressable>
        ) : (
          <View style={styles.notifRow}>
            <Text style={styles.notifText}>🔔 Remind me 1 day before</Text>
            <Toggle on={reminderOn} onToggle={() => setReminderOn((v) => !v)} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: 12, overflow: 'hidden', ...shadow.sm },
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
});
