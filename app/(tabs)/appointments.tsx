import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, ink, space } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { Banner, Button, HeroCard, PetEmptyState, Screen, SectionLabel } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { PetAvatar } from '../../components/PetAvatar';
import { ApptTabs, type ApptFilter } from '../../components/ApptTabs';
import { AppointmentCard } from '../../components/AppointmentCard';
import { APPT_TYPE_META } from '../../components/appointments/apptMeta';
import { useAppointments } from '../../context/AppointmentsContext';
import { usePets } from '../../context/PetsContext';
import { useNow } from '../../hooks/useNow';
import { computeCountdown, formatApptDate, formatApptTime } from '../../lib/appointmentUtils';
import { allDayToHasTime } from '../../lib/db/models';
import { friendlyIn, joinNames, possessive } from '../../lib/petVoice';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function AppointmentsScreen() {
  const { appointments } = useAppointments();
  const { pets, activePet } = usePets();
  const now = useNow();
  const nowMs = now.getTime();
  const [filter, setFilter] = useState<ApptFilter>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? appointments : appointments.filter((a) => a.type === filter)),
    [filter, appointments]
  );

  const stats = useMemo(() => {
    const n = new Date(nowMs);
    let thisMonth = 0;
    let thisWeek = 0;
    let overdue = 0;
    for (const a of appointments) {
      if (computeCountdown(a.startsAt, nowMs).kind === 'overdue') {
        overdue += 1;
        continue;
      }
      const d = new Date(a.startsAt);
      if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()) thisMonth += 1;
      const diffDays = Math.floor((d.getTime() - nowMs) / DAY_MS);
      if (diffDays >= 0 && diffDays <= 7) thisWeek += 1;
    }
    return { thisMonth, thisWeek, overdue };
  }, [appointments, nowMs]);

  const counts = useMemo(() => {
    const c: Partial<Record<ApptFilter, number>> = { all: appointments.length };
    for (const a of appointments) c[a.type] = (c[a.type] ?? 0) + 1;
    return c;
  }, [appointments]);

  // Split the visible list: past-date visits (gentle "needs a new date") first,
  // then everything coming up, in date order.
  const { needsDate, upcoming } = useMemo(() => {
    const past: typeof filtered = [];
    const next: typeof filtered = [];
    for (const a of filtered) {
      (computeCountdown(a.startsAt, nowMs).kind === 'overdue' ? past : next).push(a);
    }
    next.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return { needsDate: past, upcoming: next };
  }, [filtered, nowMs]);

  // The very next visit across all pets, for the hero.
  const nextVisit = useMemo(() => {
    let best: (typeof appointments)[number] | null = null;
    for (const a of appointments) {
      if (computeCountdown(a.startsAt, nowMs).kind === 'overdue') continue;
      if (!best || new Date(a.startsAt).getTime() < new Date(best.startsAt).getTime()) best = a;
    }
    return best;
  }, [appointments, nowMs]);

  const nextPets = nextVisit
    ? nextVisit.petIds
        .map((id) => pets.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
    : [];
  const heroPet = nextPets[0] ?? null;

  const singlePet = pets.length === 1 ? pets[0] : null;
  const allNames = joinNames(pets.map((p) => p.name));
  const headerTitle = singlePet ? `${possessive(singlePet.name)} visits` : 'Family visits';
  const headerEyebrow = pets.length > 1 ? `For ${allNames}` : 'Vet, vaccines & grooming';

  const goAdd = () => router.push('/add-appointment');
  const openAppt = (id: string) => router.push({ pathname: '/add-appointment', params: { apptId: id } });

  const filterMeta = filter === 'all' ? null : APPT_TYPE_META[filter];
  const emptyTitle = filterMeta
    ? `No ${filterMeta.plural} planned`
    : pets.length > 0
      ? `No visits planned for ${allNames}`
      : 'No visits planned yet';

  const nextWhen = nextVisit
    ? `${formatApptDate(nextVisit.startsAt)} · ${
        allDayToHasTime(nextVisit.allDay) ? formatApptTime(nextVisit.startsAt) : 'All day'
      }`
    : '';
  const nextCountdown = nextVisit
    ? (() => {
        const cd = computeCountdown(nextVisit.startsAt, nowMs);
        if (cd.label === 'Today' && new Date(nextVisit.startsAt).getTime() > nowMs && allDayToHasTime(nextVisit.allDay)) {
          return `Today, ${friendlyIn(nextVisit.startsAt, now)}`;
        }
        if (cd.kind === 'soon') return cd.label;
        const rel = friendlyIn(nextVisit.startsAt, now);
        return rel.charAt(0).toUpperCase() + rel.slice(1);
      })()
    : '';

  return (
    <Screen
      tabBar
      header={<TopNavBar pet={singlePet ?? activePet} eyebrow={headerEyebrow} title={headerTitle} />}
      contentStyle={styles.content}
    >
      {appointments.length === 0 ? (
        <PetEmptyState
          variant="card"
          pet={singlePet ?? activePet}
          icon="calendar"
          tone="vet"
          title={emptyTitle}
          body="Add a vet check-up or grooming and we'll remind you the day before."
          action={{ label: 'Plan a visit', icon: 'plus', onPress: goAdd }}
          style={styles.firstEmpty}
        />
      ) : (
        <>
          {nextVisit ? (
            <HeroCard
              leading={heroPet ? <PetAvatar pet={heroPet} size={60} ring="onDark" /> : undefined}
              title={nextVisit.title}
              subtitle={`${nextPets.length > 0 ? `${joinNames(nextPets.map((p) => p.name))} · ` : ''}${
                APPT_TYPE_META[nextVisit.type].label
              }`}
              stats={[
                { value: String(stats.thisWeek), label: 'This week' },
                { value: String(stats.thisMonth), label: 'This month' },
                {
                  value: String(stats.overdue),
                  label: 'New date needed',
                  accent: stats.overdue > 0 ? amber.gold : undefined,
                },
              ]}
              action={{ label: 'See visit details', icon: 'arrowRight', onPress: () => openAppt(nextVisit.id) }}
            >
              <View style={styles.heroChips}>
                <View style={styles.heroChip}>
                  <Icon name="clock" size={15} color={ink.onDark} strokeWidth={2.2} />
                  <Text style={styles.heroChipText}>{nextCountdown}</Text>
                </View>
                <View style={[styles.heroChip, styles.heroChipShrink]}>
                  <Icon name="calendar" size={15} color={ink.onDark} strokeWidth={2.2} />
                  <Text style={styles.heroChipText} numberOfLines={1}>
                    {nextWhen}
                  </Text>
                </View>
                {!!nextVisit.location && (
                  <View style={[styles.heroChip, styles.heroChipShrink]}>
                    <Icon name="mapPin" size={15} color={ink.onDark} strokeWidth={2.2} />
                    <Text style={styles.heroChipText} numberOfLines={1}>
                      {nextVisit.location}
                    </Text>
                  </View>
                )}
              </View>
            </HeroCard>
          ) : (
            <HeroCard
              eyebrow="Next visit"
              title="Nothing coming up"
              subtitle="Plan the next check-up or groom and we'll keep track of it."
              stats={[
                { value: String(stats.thisWeek), label: 'This week' },
                { value: String(stats.thisMonth), label: 'This month' },
                {
                  value: String(stats.overdue),
                  label: 'New date needed',
                  accent: stats.overdue > 0 ? amber.gold : undefined,
                },
              ]}
            />
          )}

          {stats.overdue > 0 && (
            <Banner
              tone="attention"
              icon="calendar"
              title={
                stats.overdue === 1 ? 'One visit needs a new date' : `${stats.overdue} visits need a new date`
              }
              body="No rush. Tap the visit below to pick a new day."
              compact
              style={styles.banner}
            />
          )}
        </>
      )}

      {appointments.length > 0 && (
        <>
          <View style={styles.filters}>
            <ApptTabs value={filter} onChange={setFilter} counts={counts} />
          </View>

          {filtered.length === 0 ? (
            <PetEmptyState
              variant="card"
              icon={filterMeta?.icon ?? 'calendar'}
              tone={filterMeta?.tone ?? 'vet'}
              title={emptyTitle}
              body="Add one and we'll remind you the day before."
              action={{ label: 'Plan a visit', icon: 'plus', onPress: goAdd }}
            />
          ) : (
            <>
              {needsDate.length > 0 && (
                <>
                  <SectionLabel hint="These dates have passed">Needs a new date</SectionLabel>
                  {needsDate.map((appt) => (
                    <AppointmentCard key={appt.id} appt={appt} now={now} />
                  ))}
                </>
              )}
              {upcoming.length > 0 && (
                <>
                  <SectionLabel
                    hint={singlePet ? undefined : 'Soonest first'}
                    style={needsDate.length > 0 ? styles.sectionGap : undefined}
                  >
                    {singlePet ? `Coming up for ${singlePet.name}` : 'Coming up'}
                  </SectionLabel>
                  {upcoming.map((appt) => (
                    <AppointmentCard key={appt.id} appt={appt} now={now} />
                  ))}
                </>
              )}
            </>
          )}

          <Button
            label="Plan another visit"
            icon="plus"
            variant="soft"
            fullWidth
            onPress={goAdd}
            style={styles.addMore}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.xs },
  firstEmpty: { marginTop: space.lg },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    maxWidth: '100%',
  },
  heroChipShrink: { flexShrink: 1 },
  heroChipText: { ...type.caption, fontSize: 13, fontFamily: fonts.bold, color: ink.onDark, flexShrink: 1 },
  banner: { marginTop: space.md },
  filters: { marginHorizontal: -space.gutter, marginTop: space.section, marginBottom: space.lg },
  sectionGap: { marginTop: space.lg },
  addMore: { marginTop: space.xs },
});
