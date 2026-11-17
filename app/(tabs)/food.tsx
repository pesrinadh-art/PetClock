// "Mochi's meals" — the meal plan + meds for the active pet (redesign v3). Not a bar tab: it is
// opened from the pet profile ("Meal plan"), and lives inside the tab navigator so the bottom
// bar stays visible with no tab highlighted. Tapping a meal row logs that meal.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { category, green, ink, radius, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar, greeting } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { EmptyState } from '../../components/EmptyState';
import { EmptyActionCard } from '../../components/EmptyActionCard';
import { AppModal } from '../../components/AppModal';
import { Card, HeroAvatar, HeroCard, ListRow, Pill, SectionLabel } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useNow } from '../../hooks/useNow';
import { formatClock, getTodaysMeals, parseClockTime, type ScheduleRowItem } from '../../lib/petSchedule';

const HOUR_MS = 60 * 60 * 1000;

function mealVisual(name: string): { icon: IconName; bg: string; color: string } {
  if (name === 'Dinner') return { icon: 'moon', bg: category.dinnerBg, color: category.dinnerInk };
  if (name === 'Breakfast' || name === 'Brunch' || name === 'Lunch')
    return { icon: 'sun', bg: category.breakfastBg, color: category.breakfastInk };
  return { icon: 'bowl', bg: category.otherBg, color: category.otherInk };
}

export default function FoodScreen() {
  const { pets, activePet, activePetId, setActivePetId, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const now = useNow();
  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);

  if (!activePet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopNavBar eyebrow={greeting(now)} title="Meals" />
        <EmptyState icon="🍽️" title="No pets yet" body="Add a pet to plan their meals and medications." />
      </SafeAreaView>
    );
  }

  const logs = getLogsForPet(activePet.id);
  const meals = getTodaysMeals(getFeedTimesForPet(activePet.id), now, logs);
  const meds = getMedicationsForPet(activePet.id).filter((m) => m.active);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);

  const editRoutine = (step: 'routine' | 'meds') =>
    router.push({ pathname: '/add-pet', params: { petId: activePet.id, step } });

  // Logs a food entry for the slot so the row flips to "Done" (matched by feedTimeId, Δ1).
  const logMeal = (meal: ScheduleRowItem) => {
    addLog(activePet.id, { type: 'food', feedTimeId: meal.feedTimeId ?? null });
  };

  const handleMarkDone = (meal: ScheduleRowItem) => {
    if (meal.status === 'done') return;
    // Earlier than an hour before the scheduled time → confirm the early feeding first.
    if (now.getTime() < meal.time.getTime() - HOUR_MS) {
      setPendingMeal(meal);
      return;
    }
    logMeal(meal);
  };

  const subtitleBits = [
    meals.length > 0 ? `${meals.length} ${meals.length === 1 ? 'meal' : 'meals'} a day` : 'No meal times yet',
    activePet.breed || null,
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar pet={activePet} eyebrow={greeting(now)} title={`${activePet.name}'s meals`} />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          title={`${activePet.name}'s meal plan`}
          subtitle={subtitleBits.join(' · ')}
          leading={<HeroAvatar pet={activePet} size={60} />}
          stats={[
            { value: meals.length > 0 ? String(meals.length) : '—', label: 'Meals a day' },
            { value: meds.length > 0 ? String(meds.length) : '—', label: 'Meds today' },
          ]}
          style={styles.hero}
        />

        <SectionLabel sub="Tap a meal once it's in the bowl.">Today's meals</SectionLabel>
        {meals.length === 0 ? (
          <EmptyActionCard
            title={`No meal times for ${activePet.name} yet`}
            body="Add feeding times and we'll remind you when it's time to eat."
            actionLabel="Set meal times"
            onAction={() => editRoutine('routine')}
          />
        ) : (
          <Card>
            {meals.map((meal, i) => {
              const v = mealVisual(meal.name);
              const done = meal.status === 'done';
              return (
                <ListRow
                  key={meal.id}
                  icon={v.icon}
                  iconBg={v.bg}
                  iconColor={v.color}
                  iconLarge
                  title={meal.name}
                  subtitle={formatClock(meal.time)}
                  onPress={done ? undefined : () => handleMarkDone(meal)}
                  divider={i < meals.length - 1}
                  right={
                    done ? (
                      <Pill
                        label="Done"
                        bg={green.tint}
                        color={green.primary}
                        icon={<Icon name="check" size={12} color={green.primary} strokeWidth={3.2} />}
                      />
                    ) : (
                      <Pill label={meal.status === 'due' ? 'Due' : 'Later'} bg={surface.chip} color={ink.muted} />
                    )
                  }
                />
              );
            })}
          </Card>
        )}

        <View style={styles.section}>
          <SectionLabel>{activePet.name}'s meds</SectionLabel>
          {meds.length === 0 ? (
            <Pressable
              style={({ pressed }) => [styles.dashed, pressed && styles.pressed]}
              onPress={() => editRoutine('meds')}
              role="button"
              aria-label="Add medication"
            >
              <Icon name="plus" size={15} color={ink.muted} strokeWidth={2.2} />
              <Text style={styles.dashedText}>Add medication</Text>
            </Pressable>
          ) : (
            <Card>
              {meds.map((med, i) => {
                const t = parseClockTime(med.localTime, now);
                const given = logs.some(
                  (l) =>
                    l.type === 'medication' &&
                    l.medicationId === med.id &&
                    !l.deletedAt &&
                    new Date(l.occurredAt).getTime() >= todayStart,
                );
                const due = !given && !!t && t.getTime() <= now.getTime();
                return (
                  <ListRow
                    key={med.id}
                    icon="pill"
                    iconBg={category.medBg}
                    iconColor={category.medInk}
                    iconLarge
                    title={med.name}
                    subtitle={t ? `Around ${formatClock(t)}` : med.localTime}
                    onPress={() => editRoutine('meds')}
                    divider={i < meds.length - 1}
                    showChevron={false}
                    right={
                      given ? (
                        <Pill label="Given" bg={green.tint} color={green.primary} />
                      ) : (
                        <Pill label={due ? 'Due' : 'Later'} bg={surface.chip} color={ink.muted} />
                      )
                    }
                  />
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>

      <AppModal visible={!!pendingMeal} transparent animationType="fade" onRequestClose={() => setPendingMeal(null)}>
        <Pressable style={styles.overlay} onPress={() => setPendingMeal(null)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Aw, is it my {pendingMeal?.name.toLowerCase()} already? 🐶</Text>
            <Text style={styles.dialogBody}>
              It's a little early — mark {pendingMeal?.name.toLowerCase()} as fed now?
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setPendingMeal(null)}
                role="button"
                aria-label="Not yet"
              >
                <Text style={styles.cancelBtnText}>Not yet</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.confirmBtn, pressed && styles.pressed]}
                onPress={() => {
                  if (pendingMeal) logMeal(pendingMeal);
                  setPendingMeal(null);
                }}
                role="button"
                aria-label={pendingMeal ? `Feed ${pendingMeal.name} now for ${activePet.name}` : 'Feed now'}
              >
                <Text style={styles.confirmBtnText}>Yes, feed now</Text>
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 80 },
  hero: { marginBottom: 22 },
  section: { marginTop: 26 },
  pressed: { opacity: 0.7 },
  dashed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#d8d1c2',
  },
  dashedText: { fontSize: 13, fontFamily: fonts.semiBold, color: ink.muted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 320, backgroundColor: surface.card, borderRadius: radius.lg, padding: 20 },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: green.tint },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: green.primary },
  confirmBtn: { backgroundColor: green.mid },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: ink.onDark },
});
