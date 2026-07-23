import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { HeroCard } from '../../components/HeroCard';
import { ApptTabs, type ApptFilter } from '../../components/ApptTabs';
import { AppointmentCard } from '../../components/AppointmentCard';
import { SectionTitle } from '../../components/SectionTitle';
import { useAppointments } from '../../context/AppointmentsContext';
import { computeCountdown } from '../../lib/appointmentUtils';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function AppointmentsScreen() {
  const { appointments } = useAppointments();
  const [filter, setFilter] = useState<ApptFilter>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? appointments : appointments.filter((a) => a.type === filter)),
    [filter, appointments]
  );

  const stats = useMemo(() => {
    const now = new Date();
    let thisMonth = 0;
    let thisWeek = 0;
    let overdue = 0;
    for (const a of appointments) {
      if (computeCountdown(a.dateTime, now.getTime()).kind === 'overdue') {
        overdue += 1;
        continue;
      }
      const d = new Date(a.dateTime);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) thisMonth += 1;
      const diffDays = Math.floor((a.dateTime - now.getTime()) / DAY_MS);
      if (diffDays >= 0 && diffDays <= 7) thisWeek += 1;
    }
    return { thisMonth, thisWeek, overdue };
  }, [appointments]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          colorsGradient={[colors.apptVet, colors.apptGroom]}
          watermark="📅"
          title="📅 Appointments"
          sub="All pets · Upcoming care schedule"
          stats={[
            { value: String(stats.thisMonth), label: 'This Month' },
            { value: String(stats.thisWeek), label: 'This Week' },
            { value: String(stats.overdue), label: 'Overdue' },
          ]}
        />

        <ApptTabs value={filter} onChange={setFilter} />
        <View style={{ height: 14 }} />

        <SectionTitle>Upcoming</SectionTitle>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={styles.emptyText}>No appointments in this category yet.</Text>
          </View>
        ) : (
          filtered.map((appt) => <AppointmentCard key={appt.id} appt={appt} />)
        )}

        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => router.push('/add-appointment')}
          accessibilityRole="button"
          accessibilityLabel="Add appointment"
        >
          <Text style={styles.addBtnText}>➕ Add Appointment</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  addBtn: {
    backgroundColor: colors.sage,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  addBtnText: { color: colors.white, fontSize: 14, fontFamily: fonts.extraBold },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyEmoji: { fontSize: 32, opacity: 0.6 },
  emptyText: { fontSize: 13, color: colors.stoneMid, textAlign: 'center' },
});
