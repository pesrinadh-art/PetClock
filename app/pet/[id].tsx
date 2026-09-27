import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { space, type Tone } from '../../theme/colors';
import { type IconName } from '../../components/Icon';
import {
  Banner,
  Button,
  Card,
  IconButton,
  ListRow,
  PetEmptyState,
  Pill,
  Screen,
  ScreenHeader,
  SectionLabel,
  type Stat,
} from '../../components/ui';
import { PetAvatar } from '../../components/PetAvatar';
import { PetProfileHero } from '../../components/pets/PetProfileHero';
import { ConfirmDialog } from '../../components/pets/ConfirmDialog';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useAppointments } from '../../context/AppointmentsContext';
import { getTodaysMeals, formatClock, parseClockTime, type ScheduleRowItem } from '../../lib/petSchedule';
import { useNow } from '../../hooks/useNow';
import {
  friendlyIn,
  isBirthday,
  petMeta,
  possessive,
  progressLine,
  speciesLabel,
} from '../../lib/petVoice';

const HOUR_MS = 60 * 60 * 1000;

/** Maps a derived meal-slot name to a drawn icon + role tone (sun = breakfast, moon = dinner). */
function mealVisual(name: string): { icon: IconName; tone: Tone } {
  switch (name) {
    case 'Dinner':
      return { icon: 'moon', tone: 'food' };
    case 'Breakfast':
    case 'Brunch':
    case 'Lunch':
      return { icon: 'sun', tone: 'food' };
    default:
      return { icon: 'bowl', tone: 'food' };
  }
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pets'));

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const { appointments } = useAppointments();
  const now = useNow();

  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);
  // Keeps the dialog copy stable while it fades out after pendingMeal is cleared.
  const lastMealName = useRef('meal');
  if (pendingMeal) lastMealName.current = pendingMeal.name;
  const dialogMeal = lastMealName.current;

  const pet = pets.find((p) => p.id === id) ?? null;

  if (!pet) {
    return (
      <Screen header={<ScreenHeader title="Pet" onBack={goBack} backLabel="Back" />} scroll={false}>
        <PetEmptyState
          icon="paw"
          title="We can't find this pet"
          body="They may have been removed. Head back to see your pets."
          action={{ label: 'Back to your pets', icon: 'chevronLeft', onPress: goBack }}
        />
      </Screen>
    );
  }

  const feedTimes = getFeedTimesForPet(pet.id);
  const logs = getLogsForPet(pet.id);
  const meds = getMedicationsForPet(pet.id).filter((m) => m.active);
  const activeLogs = logs.filter((l) => !l.deletedAt);
  const meals = getTodaysMeals(feedTimes, now, logs);

  const name = pet.name;
  const their = possessive(name);
  const birthday = isBirthday(pet.birthdate, now);

  // Hero stats — meals a day · hold time · meds.
  const feedCount = meals.length;
  const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
  const holdDisplay = Number.isFinite(tightestHold) ? `${tightestHold}h` : '—';
  const stats: Stat[] = [
    { value: feedCount > 0 ? `${feedCount}×` : '—', label: 'Meals a day' },
    { value: holdDisplay, label: 'Holds up to' },
    { value: meds.length > 0 ? String(meds.length) : '—', label: 'Daily meds' },
  ];
  // petMeta already leads with the breed; when there is one, show the species as a small tag.
  const tags = pet.breed?.trim() && pet.species !== 'other' ? [speciesLabel(pet.species)] : [];

  const mealsDone = meals.filter((m) => m.status === 'done').length;
  const nextMeal = meals.find((m) => m.status !== 'done') ?? null;

  // Vaccinations record — derived honestly from this pet's vaccine appointments.
  const vaccineAppts = appointments.filter(
    (a) => !a.deletedAt && a.type === 'vaccine' && a.petIds.includes(pet.id),
  );
  const upcomingVaccine = vaccineAppts.some((a) => new Date(a.startsAt).getTime() > now.getTime());
  const vaccine: { label: string; tone: Tone; icon?: IconName } = upcomingVaccine
    ? { label: 'Scheduled', tone: 'pet', icon: 'check' }
    : vaccineAppts.length > 0
      ? { label: 'On file', tone: 'vaccine' }
      : { label: 'None yet', tone: 'neutral' };

  const editPet = () => router.push({ pathname: '/add-pet', params: { petId: pet.id } });
  const openHistory = () => router.push({ pathname: '/pet/[id]/history', params: { id: pet.id } });

  // Logs a food entry for the meal — mirrors the old Food tab / MealTimeBanner call so the row
  // flips to "Fed" (getTodaysMeals matches the log to this slot by feedTimeId, Δ1).
  const logMeal = (meal: ScheduleRowItem) => {
    addLog(pet.id, { type: 'food', feedTimeId: meal.feedTimeId ?? null });
  };

  const handleMarkDone = (meal: ScheduleRowItem) => {
    // Earlier than an hour before the scheduled time → confirm the early feeding first.
    if (now.getTime() < meal.time.getTime() - HOUR_MS) {
      setPendingMeal(meal);
      return;
    }
    logMeal(meal);
  };

  const confirmPendingMeal = () => {
    if (pendingMeal) logMeal(pendingMeal);
    setPendingMeal(null);
  };

  const footer = nextMeal ? (
    <Button
      label={`Log ${nextMeal.name.toLowerCase()} for ${name}`}
      tone="food"
      icon="bowl"
      fullWidth
      onPress={() => handleMarkDone(nextMeal)}
      accessibilityLabel={`Mark ${nextMeal.name} as fed for ${name}`}
    />
  ) : (
    <Button label={`Edit ${their} routine`} icon="pencil" variant="secondary" fullWidth onPress={editPet} />
  );

  return (
    <Screen
      header={
        <ScreenHeader
          title={name}
          subtitle={`${their} profile`}
          onBack={goBack}
          backLabel="Back"
          right={<IconButton icon="pencil" tone="pet" accessibilityLabel={`Edit ${name}`} onPress={editPet} />}
        />
      }
      footer={footer}
    >
      <PetProfileHero pet={pet} meta={petMeta(pet, now)} stats={stats} birthday={birthday} tags={tags} />

      {birthday ? (
        <Banner
          tone="pet"
          icon="cake"
          title={`Happy birthday, ${name}!`}
          body="A perfect day for an extra treat and a long cuddle."
          style={styles.banner}
        />
      ) : null}

      {/* ── Meal times (the meal logging that used to be the Food tab) ── */}
      <View style={styles.section}>
        <SectionLabel hint={meals.length > 0 ? progressLine(mealsDone, meals.length) : undefined}>
          {`${their} meals`}
        </SectionLabel>
        {meals.length > 0 ? (
          <>
            <Card>
              {meals.map((meal, i) => {
                const v = mealVisual(meal.name);
                const done = meal.status === 'done';
                const due = meal.status === 'due';
                const when = formatClock(meal.time);
                const subtitle = done
                  ? `${when} · fed`
                  : due
                    ? `${when} · ready when ${name} is`
                    : `${when} · ${friendlyIn(meal.time, now)}`;
                return (
                  <ListRow
                    key={meal.id}
                    icon={v.icon}
                    tone={v.tone}
                    iconLarge
                    title={meal.name}
                    subtitle={subtitle}
                    divider={i < meals.length - 1}
                    right={
                      done ? (
                        <Pill tone="pet" icon="check" label="Fed" />
                      ) : (
                        <Button
                          label="Log"
                          tone="food"
                          variant={due ? 'primary' : 'soft'}
                          size="md"
                          onPress={() => handleMarkDone(meal)}
                          accessibilityLabel={`Mark ${meal.name} as fed for ${name}`}
                        />
                      )
                    }
                  />
                );
              })}
            </Card>
            <Button
              label="Edit meal times"
              icon="clock"
              variant="ghost"
              size="md"
              onPress={editPet}
              style={styles.inlineAction}
            />
          </>
        ) : (
          <PetEmptyState
            variant="card"
            icon="bowl"
            tone="food"
            title={`No meal times for ${name} yet`}
            body="Add them and we'll remind you when it's time to eat."
            action={{ label: 'Add meal times', icon: 'clock', onPress: editPet }}
          />
        )}
      </View>

      {/* ── Medications ── */}
      <View style={styles.section}>
        <SectionLabel>{`${their} meds`}</SectionLabel>
        {meds.length > 0 ? (
          <>
            <Card>
              {meds.map((med, i) => {
                const t = parseClockTime(med.localTime, now);
                const time = t ? `Every day at ${formatClock(t)}` : med.localTime;
                const subtitle = med.dosage ? `${med.dosage} · ${time}` : time;
                return (
                  <ListRow
                    key={med.id}
                    icon="pill"
                    tone="med"
                    iconLarge
                    title={med.name}
                    subtitle={subtitle}
                    onPress={editPet}
                    accessibilityLabel={`${med.name}, ${subtitle}. Edit`}
                    divider={i < meds.length - 1}
                  />
                );
              })}
            </Card>
            <Button
              label="Add medication"
              icon="plus"
              variant="ghost"
              size="md"
              onPress={editPet}
              style={styles.inlineAction}
            />
          </>
        ) : (
          <PetEmptyState
            variant="card"
            icon="pill"
            tone="med"
            title={`No meds for ${name}`}
            body="If they take regular medicine, add it and we'll nudge you when it's due."
            action={{ label: 'Add medication', icon: 'plus', onPress: editPet }}
          />
        )}
      </View>

      {/* ── Records ── */}
      <View style={styles.section}>
        <SectionLabel>Care records</SectionLabel>
        <Card>
          <ListRow
            icon="history"
            tone="pet"
            iconLarge
            title={`${their} diary`}
            subtitle={
              activeLogs.length > 0
                ? `${activeLogs.length} ${activeLogs.length === 1 ? 'moment' : 'moments'} logged`
                : 'Nothing logged yet'
            }
            showChevron
            divider
            onPress={openHistory}
          />
          <ListRow
            icon="vaccine"
            tone="vaccine"
            iconLarge
            title="Vaccinations"
            subtitle="From your planned visits"
            right={<Pill tone={vaccine.tone} icon={vaccine.icon} label={vaccine.label} size="sm" />}
            showChevron
            onPress={() => router.push('/(tabs)/appointments')}
          />
        </Card>
      </View>

      {/* Early-feeding confirm — preserved from the old Food tab. */}
      <ConfirmDialog
        visible={!!pendingMeal}
        onClose={() => setPendingMeal(null)}
        leading={<PetAvatar pet={pet} size={64} ring />}
        title={`${dialogMeal.charAt(0).toUpperCase()}${dialogMeal.slice(1)} already?`}
        body={`It's a little early for ${their} ${dialogMeal.toLowerCase()}. Mark it as fed now?`}
        confirm={{
          label: 'Yes, feed now',
          tone: 'food',
          icon: 'bowl',
          accessibilityLabel: pendingMeal ? `Feed ${pendingMeal.name} now for ${name}` : 'Feed now',
          onPress: confirmPendingMeal,
        }}
        cancel={{ label: 'Not yet', accessibilityLabel: 'Not yet' }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: space.lg },
  section: { marginTop: space.section },
  inlineAction: { alignSelf: 'center', marginTop: space.xxs },
});
