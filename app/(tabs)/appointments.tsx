import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { green, ink, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { HeroCard, SectionLabel } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApptTabs, type ApptFilter } from '../../components/ApptTabs';
import { AppointmentCard } from '../../components/AppointmentCard';
import { useAppointments } from '../../context/AppointmentsContext';
import { computeCountdown } from '../../lib/appointmentUtils';

const DAY_MS = 24 * 60 * 60 * 1000;

// Charcoal hero variant (screen_2c) — carries the design-system HeroCard with an
// overridden dark gradient rather than the default green.
const CHARCOAL_GRADIENT: [string, string] = ['#3c3a46', '#2a2833'];

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
      if (computeCountdown(a.startsAt, now.getTime()).kind === 'overdue') {
        overdue += 1;
        continue;
      }
      const d = new Date(a.startsAt);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) thisMonth += 1;
      const diffDays = Math.floor((d.getTime() - now.getTime()) / DAY_MS);
      if (diffDays >= 0 && diffDays <= 7) thisWeek += 1;
    }
    return { thisMonth, thisWeek, overdue };
  }, [appointments]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          gradient={CHARCOAL_GRADIENT}
          eyebrow="All pets · care schedule"
          title="Appointments"
          stats={[
            { value: String(stats.thisMonth), label: 'This month' },
            { value: String(stats.thisWeek), label: 'This week' },
            { value: String(stats.overdue), label: 'Overdue', accent: '#f0a99a' },
          ]}
        />

        <View style={styles.chips}>
          <ApptTabs value={filter} onChange={setFilter} />
        </View>

        <SectionLabel>Upcoming</SectionLabel>
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Icon name="calendar" size={26} color="#b5ac9c" strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptySub}>
              Vet visits, vaccines and grooming will show up here once you add them.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
              onPress={() => router.push('/add-appointment')}
              role="button"
              aria-label="Add appointment"
            >
              <Icon name="plus" size={15} color={ink.onDark} strokeWidth={2.4} />
              <Text style={styles.addBtnText}>Add appointment</Text>
            </Pressable>
          </View>
        ) : (
          filtered.map((appt) => <AppointmentCard key={appt.id} appt={appt} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 28 },
  chips: { marginHorizontal: -20, paddingHorizontal: 20, marginTop: 16, marginBottom: 18 },
  emptyCard: {
    backgroundColor: surface.card,
    borderRadius: 20,
    paddingVertical: 34,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#2a2724',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f4f0e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontFamily: fonts.bold, color: ink.primary, marginTop: 14 },
  emptySub: {
    fontSize: 13,
    color: ink.muted,
    fontFamily: fonts.medium,
    lineHeight: 19.5,
    marginTop: 5,
    maxWidth: 230,
    textAlign: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: green.mid,
    shadowColor: green.mid,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  addBtnPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  addBtnText: { color: ink.onDark, fontSize: 13.5, fontFamily: fonts.extraBold },
});
