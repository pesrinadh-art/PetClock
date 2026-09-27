// TODO redesign: meal UI moved to the pet profile. This Food TAB is retired —
// it's hidden from the bottom bar (href:null in (tabs)/_layout.tsx) but the file
// and its meal logic/helpers are kept so nothing breaks until a Phase-2 agent
// rebuilds meal logging inside the pet profile.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ink, radius, shadow, space, surface } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetAvatar } from '../../components/PetAvatar';
import { ScheduleRow } from '../../components/ScheduleRow';
import { AppModal } from '../../components/AppModal';
import {
  Banner,
  Button,
  Card,
  HeroCard,
  PetEmptyState,
  ProgressBar,
  Screen,
  SectionLabel,
} from '../../components/ui';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useNow } from '../../hooks/useNow';
import { getTodaysMeals, getTodaysMedications, type ScheduleRowItem } from '../../lib/petSchedule';
import { greeting, petMeta, possessive, progressLine, speciesCheer } from '../../lib/petVoice';

const HOUR_MS = 60 * 60 * 1000;

export default function FoodScreen() {
  const { pets, activePet, activePetId, setActivePetId, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const clock = useNow();
  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);

  if (!activePet) {
    return (
      <Screen header={<TopNavBar />} scroll={false} tabBar>
        <PetEmptyState
          icon="bowl"
          tone="food"
          title="Let's meet your pet"
          body="Add a pet and we'll help you plan their meals and medications."
          action={{ label: 'Add your first pet', icon: 'plus', onPress: () => router.push('/add-pet') }}
        />
      </Screen>
    );
  }

  const now = clock;
  const meals = getTodaysMeals(getFeedTimesForPet(activePet.id), now, getLogsForPet(activePet.id));
  const medications = getTodaysMedications(getMedicationsForPet(activePet.id), now);
  const mealsDone = meals.filter((m) => m.status === 'done').length;
  const allFed = meals.length > 0 && mealsDone === meals.length;
  const name = activePet.name;

  const editPet = () => router.push({ pathname: '/add-pet', params: { petId: activePet.id } });

  // Logs a food entry for the meal — mirrors MealTimeBanner's call so the row flips to "Done"
  // (getTodaysMeals matches the log to this slot by feedTimeId, Δ1).
  const logMeal = (meal: ScheduleRowItem) => {
    addLog(activePet.id, { type: 'food', feedTimeId: meal.feedTimeId ?? null });
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

  const heroSubtitle =
    meals.length > 0
      ? `${meals.length} meal${meals.length === 1 ? '' : 's'} a day · ${petMeta(activePet, now)}`
      : `No meal times yet · ${petMeta(activePet, now)}`;

  return (
    <Screen
      tabBar
      header={
        <>
          <TopNavBar pet={activePet} eyebrow={greeting(now)} title={`${possessive(name)} meals`} />
          <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
        </>
      }
    >
      <HeroCard
        title={`${possessive(name)} meal plan`}
        subtitle={heroSubtitle}
        leading={<PetAvatar pet={activePet} size={60} emojiSize={32} ring="onDark" />}
        stats={[
          { value: meals.length > 0 ? `${meals.length}x` : '—', label: 'Meals a day' },
          { value: medications.length > 0 ? String(medications.length) : '—', label: 'Meds today' },
        ]}
        style={styles.hero}
      >
        {meals.length > 0 ? (
          <ProgressBar
            variant="onDark"
            value={mealsDone}
            total={meals.length}
            label="Meals today"
            caption={progressLine(mealsDone, meals.length)}
          />
        ) : null}
      </HeroCard>

      {allFed ? (
        <Banner
          tone="pet"
          icon="sparkle"
          title={`${speciesCheer(activePet.species)} ${name} is all fed today`}
          body="Every meal is logged. Nice work."
          compact
          style={styles.win}
        />
      ) : null}

      <SectionLabel hint="Tap a meal once it's in the bowl.">Today's meals</SectionLabel>
      {meals.length === 0 ? (
        <PetEmptyState
          variant="card"
          icon="bowl"
          tone="food"
          title={`No meal times for ${name} yet`}
          body="Add feeding times and we'll remind you when it's time to eat."
          action={{ label: 'Set meal times', icon: 'plus', onPress: editPet }}
        />
      ) : (
        <Card>
          {meals.map((meal, i) => (
            <ScheduleRow
              key={meal.id}
              item={meal}
              tone="food"
              fallbackIcon="bowl"
              onLogNow={() => handleMarkDone(meal)}
              logAccessibilityLabel={`Mark ${meal.name} as fed for ${name}`}
              divider={i < meals.length - 1}
            />
          ))}
        </Card>
      )}

      <View style={styles.section}>
        <SectionLabel>{`${possessive(name)} meds`}</SectionLabel>
        {medications.length === 0 ? (
          <PetEmptyState
            variant="card"
            icon="pill"
            tone="med"
            title={`No meds for ${name}`}
            body="Add one and we'll nudge you when it's due."
            action={{ label: 'Add medication', icon: 'plus', onPress: editPet }}
          />
        ) : (
          <Card>
            {medications.map((med, i) => (
              <ScheduleRow
                key={med.id}
                item={med}
                tone="med"
                fallbackIcon="pill"
                divider={i < medications.length - 1}
              />
            ))}
          </Card>
        )}
      </View>

      {meals.length > 0 || medications.length > 0 ? (
        <View style={styles.footerActions}>
          <Button
            label={meals.length > 0 ? 'Edit meal times' : 'Set meal times'}
            icon="pencil"
            variant="secondary"
            tone="food"
            fullWidth
            onPress={editPet}
            accessibilityLabel="Edit meal times"
          />
          {medications.length > 0 ? (
            <Button
              label="Edit medications"
              icon="pill"
              variant="ghost"
              tone="med"
              fullWidth
              onPress={editPet}
              accessibilityLabel="Edit medications"
            />
          ) : null}
        </View>
      ) : null}

      <AppModal visible={!!pendingMeal} transparent animationType="fade" onRequestClose={() => setPendingMeal(null)}>
        <Pressable style={styles.overlay} onPress={() => setPendingMeal(null)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogAvatar}>
              <PetAvatar pet={activePet} size={56} emojiSize={30} ring />
            </View>
            <Text style={styles.dialogTitle}>
              {`A little early for ${pendingMeal?.name.toLowerCase() ?? 'this meal'}?`}
            </Text>
            <Text style={styles.dialogBody}>
              {`It's more than an hour before ${possessive(name)} usual ${pendingMeal?.name.toLowerCase() ?? 'meal'} time. Log it as fed now?`}
            </Text>
            <View style={styles.dialogActions}>
              <Button
                label={pendingMeal ? `Log ${pendingMeal.name.toLowerCase()} now` : 'Log it now'}
                tone="food"
                icon="check"
                fullWidth
                onPress={confirmPendingMeal}
                accessibilityLabel={pendingMeal ? `Feed ${pendingMeal.name} now for ${name}` : 'Feed now'}
              />
              <Button
                label="Not yet"
                variant="ghost"
                tone="neutral"
                size="md"
                fullWidth
                onPress={() => setPendingMeal(null)}
                accessibilityLabel="Not yet"
              />
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: space.lg },
  win: { marginBottom: space.lg },
  section: { marginTop: space.section },
  footerActions: { marginTop: space.section, gap: space.xs },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: surface.card,
    borderRadius: radius.sheet,
    padding: space.xl,
    ...shadow.card,
  },
  dialogAvatar: { alignItems: 'center', marginBottom: space.sm },
  dialogTitle: { ...type.title, fontSize: 20, color: ink.primary, textAlign: 'center', marginBottom: space.xs },
  dialogBody: { ...type.body, color: ink.muted, textAlign: 'center', marginBottom: space.xl },
  dialogActions: { gap: space.xs },
});
