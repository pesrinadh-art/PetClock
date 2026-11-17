import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { amber, green, ink, radius, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { HeroAvatar, HeroCard, SectionLabel } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { ApptTabs, type ApptFilter } from '../../components/ApptTabs';
import { AppointmentCard } from '../../components/AppointmentCard';
import { EmptyActionCard } from '../../components/EmptyActionCard';
import { useAppointments } from '../../context/AppointmentsContext';
import { usePets } from '../../context/PetsContext';
import { useNow } from '../../hooks/useNow';
import { computeCountdown, formatApptDate, formatApptTime } from '../../lib/appointmentUtils';
import { isActiveVisit, needsNewDate, upcomingVisits, VISIT_META } from '../../lib/visits';
import { joinPetNames } from '../../lib/petNames';
import { allDayToHasTime } from '../../lib/db/models';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Translucent info chip on the hero ("In 2 days", "Tue, Sep 29 · 10:00 AM", "City Vet Clinic"). */
function HeroChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.heroChip}>
      <Icon name={icon} size={15} color="#ffffff" strokeWidth={2.2} />
      <Text style={styles.heroChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Visits tab (redesign v3): the hero features the next visit with a "See visit details" button;
 * visits whose day passed without being marked done sit under "Needs a new date"; upcoming ones
 * under "Coming up". Filter chips narrow by type.
 */
export default function AppointmentsScreen() {
  const { appointments } = useAppointments();
  const { pets, activePet } = usePets();
  const now = useNow();
  const [filter, setFilter] = useState<ApptFilter>('all');

  const nowMs = now.getTime();
  const active = useMemo(() => appointments.filter(isActiveVisit), [appointments]);

  const counts = useMemo(() => {
    const c: Record<ApptFilter, number> = { all: active.length, vet: 0, vaccine: 0, groom: 0, other: 0 };
    for (const a of active) c[a.type] += 1;
    return c;
  }, [active]);

  const filtered = filter === 'all' ? active : active.filter((a) => a.type === filter);
  const late = filtered.filter((a) => needsNewDate(a, nowMs));
  const upcoming = upcomingVisits(filtered, nowMs);

  const allUpcoming = upcomingVisits(active, nowMs);
  const next = allUpcoming[0] ?? null;
  const lateCount = active.filter((a) => needsNewDate(a, nowMs)).length;
  const thisWeek = allUpcoming.filter((a) => new Date(a.startsAt).getTime() - nowMs <= 7 * DAY_MS).length;
  const thisMonth = allUpcoming.filter((a) => {
    const d = new Date(a.startsAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const stats = [
    { value: String(thisWeek), label: 'This week' },
    { value: String(thisMonth), label: 'This month' },
    { value: String(lateCount), label: 'New date needed', accent: lateCount > 0 ? '#f3d27a' : undefined },
  ];

  const nextPets = next ? pets.filter((p) => next.petIds.includes(p.id)) : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar
        pet={activePet}
        eyebrow={pets.length > 0 ? `For ${joinPetNames(pets.map((p) => p.name))}` : undefined}
        title="Family visits"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pad}>
          {next ? (
            <HeroCard
              title={next.title}
              subtitle={[joinPetNames(nextPets.map((p) => p.name)), VISIT_META[next.type].label].filter(Boolean).join(' · ')}
              leading={nextPets[0] ? <HeroAvatar pet={nextPets[0]} size={60} /> : undefined}
              stats={stats}
            >
              <View style={styles.heroChips}>
                <HeroChip icon="clock" label={computeCountdown(next.startsAt, nowMs).label} />
                <HeroChip
                  icon="calendar"
                  label={
                    allDayToHasTime(next.allDay)
                      ? `${formatApptDate(next.startsAt)} · ${formatApptTime(next.startsAt)}`
                      : `${formatApptDate(next.startsAt)} · All day`
                  }
                />
                {!!next.location && <HeroChip icon="mapPin" label={next.location} />}
              </View>
              <Pressable
                style={({ pressed }) => [styles.detailsBtn, pressed && styles.pressed]}
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: next.id } })}
                role="button"
                aria-label={`See details for ${next.title}`}
              >
                <Icon name="arrowRight" size={18} color={green.primary} strokeWidth={2.4} />
                <Text style={styles.detailsText}>See visit details</Text>
              </Pressable>
            </HeroCard>
          ) : (
            <HeroCard eyebrow="Nothing planned" title="No visits coming up" subtitle="Tap + to plan a vet visit, vaccine or grooming." stats={stats} />
          )}

          {lateCount > 0 && (
            <View style={styles.banner}>
              <View style={styles.bannerIcon}>
                <Icon name="calendar" size={18} color={amber.warnInk} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>
                  {lateCount === 1 ? 'One visit needs a new date' : `${lateCount} visits need a new date`}
                </Text>
                <Text style={styles.bannerBody}>No rush. Pick a new day, or mark it done if it already happened.</Text>
              </View>
            </View>
          )}
        </View>

        {active.length > 0 && (
          <View style={styles.chips}>
            <ApptTabs value={filter} onChange={setFilter} counts={counts} />
          </View>
        )}

        <View style={styles.pad}>
          {active.length === 0 ? (
            <View style={{ marginTop: 22 }}>
              <EmptyActionCard
                icon="calendar"
                title="No visits yet"
                body="Vet visits, vaccines and grooming will show up here once you add them."
                actionLabel="Plan a visit"
                onAction={() => router.push('/add-appointment')}
                tint={green.tint}
                ink={green.primary}
              />
            </View>
          ) : (
            <>
              {late.length > 0 && (
                <View style={styles.section}>
                  <SectionLabel sub="These dates have passed">Needs a new date</SectionLabel>
                  {late.map((appt) => (
                    <AppointmentCard key={appt.id} appt={appt} />
                  ))}
                </View>
              )}
              {upcoming.length > 0 && (
                <View style={styles.section}>
                  <SectionLabel>Coming up</SectionLabel>
                  {upcoming.map((appt) => (
                    <AppointmentCard key={appt.id} appt={appt} />
                  ))}
                </View>
              )}
              {late.length === 0 && upcoming.length === 0 && (
                <Text style={styles.noneText}>No visits of this kind.</Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 80 },
  pad: { paddingHorizontal: 20 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroChipText: { flexShrink: 1, fontSize: 13, fontFamily: fonts.bold, color: '#ffffff' },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: radius.tile,
    backgroundColor: '#ffffff',
  },
  detailsText: { fontSize: 15, fontFamily: fonts.bold, color: green.primary },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: amber.warnBg,
    borderWidth: 1,
    borderColor: '#f3dfb9',
  },
  bannerIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.iconTile,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontSize: 15, fontFamily: fonts.bold, color: amber.warnInk },
  bannerBody: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted, marginTop: 2, lineHeight: 18 },

  chips: { marginTop: 20 },
  section: { marginTop: 22 },
  noneText: { marginTop: 22, fontSize: 13, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center' },
});
