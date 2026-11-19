import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, glass, ink, radius, warn } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { HeroCard, Screen, SectionLabel, TAB_BAR_CLEARANCE } from '../../components/ui';
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

const planVisit = () => router.push('/add-appointment');

/** Mono info pill on the hero ("Tue, Sep 29 · 10:00 AM", "City Vet Clinic"); `accent` tints it. */
function HeroChip({ icon, label, tone = 'plain' }: { icon: IconName; label: string; tone?: 'plain' | 'accent' }) {
  const on = tone === 'accent';
  return (
    <View style={[styles.heroChip, on && styles.heroChipAccent]}>
      <Icon name={icon} size={13} color={on ? accent.ink : ink.muted} strokeWidth={1.8} />
      <Text style={[styles.heroChipText, { color: on ? accent.ink : ink.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Visits tab (design v2): a round glass + in the header plans a visit; the glass hero features
 * the next visit with a "See visit details" button; visits whose day passed without being marked
 * done sit under "Needs a new date"; upcoming ones under "Coming up". Filter chips narrow by type.
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
    { value: String(lateCount), label: 'New date needed', accent: lateCount > 0 ? warn.ink : undefined },
  ];

  const nextPets = next ? pets.filter((p) => next.petIds.includes(p.id)) : [];

  return (
    <Screen edges={['top']}>
      <TopNavBar
        pet={activePet}
        eyebrow={pets.length > 0 ? `For ${joinPetNames(pets.map((p) => p.name))}` : undefined}
        title="Family visits"
        action={{ icon: 'plus', label: 'Add visit', onPress: planVisit }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pad}>
          {next ? (
            <HeroCard
              eyebrow={`Next visit · ${computeCountdown(next.startsAt, nowMs).label}`}
              title={next.title}
              subtitle={[joinPetNames(nextPets.map((p) => p.name)), VISIT_META[next.type].label].filter(Boolean).join(' · ')}
              stats={stats}
            >
              <View style={styles.heroChips}>
                <HeroChip icon="calendar" tone="accent" label={formatApptDate(next.startsAt)} />
                <HeroChip icon="clock" label={allDayToHasTime(next.allDay) ? formatApptTime(next.startsAt) : 'All day'} />
                {!!next.location && <HeroChip icon="mapPin" label={next.location} />}
              </View>
              <Pressable
                style={({ pressed }) => [styles.detailsBtn, pressed && styles.pressed]}
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: next.id } })}
                role="button"
                aria-label={`See details for ${next.title}`}
              >
                <Text style={styles.detailsText}>See visit details</Text>
                <Icon name="chevronRight" size={16} color={ink.primary} strokeWidth={1.9} />
              </Pressable>
            </HeroCard>
          ) : (
            <HeroCard eyebrow="Nothing planned" title="No visits coming up" subtitle="Plan a vet visit, vaccine or grooming with the + up top." stats={stats}>
              {active.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.planBtn, pressed && styles.pressed]}
                  onPress={planVisit}
                  role="button"
                  aria-label="Plan a visit"
                >
                  <Icon name="plus" size={16} color={accent.onAccent} strokeWidth={2} />
                  <Text style={styles.planText}>Plan a visit</Text>
                </Pressable>
              )}
            </HeroCard>
          )}

          {lateCount > 0 && (
            <View style={styles.banner}>
              <Icon name="calendar" size={18} color={warn.ink} strokeWidth={1.8} />
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
                onAction={planVisit}
                tint={accent.soft}
                ink={accent.ink}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 4, paddingBottom: TAB_BAR_CLEARANCE },
  pad: { paddingHorizontal: 20 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },

  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
  },
  heroChipAccent: { backgroundColor: accent.soft, borderColor: accent.line },
  heroChipText: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.mono },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 16,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
  },
  detailsText: { fontSize: 13, fontFamily: fonts.medium, color: ink.primary },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 14,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
  },
  planText: { fontSize: 13, fontFamily: fonts.medium, color: accent.onAccent },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: radius.tile,
    backgroundColor: warn.soft,
    borderWidth: 1,
    borderColor: warn.line,
  },
  bannerTitle: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary, lineHeight: 18 },
  bannerBody: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 2, lineHeight: 18 },

  chips: { marginTop: 20 },
  section: { marginTop: 22 },
  noneText: { marginTop: 22, fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center' },
});
