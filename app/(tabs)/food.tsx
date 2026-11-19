// "Mochi's meals" — the meal plan + meds for the active pet (redesign v3). Not a bar tab: it is
import { possessive } from '../../lib/petVoice';
// opened from the pet profile ("Meal plan"), and lives inside the tab navigator so the bottom
// bar stays visible with no tab highlighted. Tapping a meal row logs that meal.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, category, glass, ink, radius, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar, greeting } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { EmptyState } from '../../components/EmptyState';
import { EmptyActionCard } from '../../components/EmptyActionCard';
import { AppModal } from '../../components/AppModal';
import { Card, HeroAvatar, HeroCard, ListRow, Pill, Screen, SectionLabel, TAB_BAR_CLEARANCE } from '../../components/ui';
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

/** Status pills (design `.pill` / `.pill.accent` / `.pill.solid`). */
function DonePill({ label }: { label: string }) {
  return (
    <Pill
      label={label}
      size="sm"
      bg={accent.soft}
      color={accent.ink}
      style={styles.accentPill}
      icon={<Icon name="check" size={12} color={accent.ink} strokeWidth={2.4} />}
    />
  );
}
function StatusPill({ due }: { due: boolean }) {
  return due ? (
    <Pill label="Due" size="sm" bg={ink.primary} color={ink.onDark} />
  ) : (
    <Pill label="Later" size="sm" bg="transparent" color={ink.muted} style={styles.mutedPill} />
  );
}

export default function FoodScreen() {
  const { pets, activePet, activePetId, setActivePetId, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const now = useNow();
  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);

  if (!activePet) {
    return (
      <Screen edges={['top']}>
        <TopNavBar eyebrow={greeting(now)} title="Meals" />
        <EmptyState icon="🍽️" title="No pets yet" body="Add a pet to plan their meals and medications." />
      </Screen>
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
    <Screen edges={['top']}>
      <TopNavBar pet={activePet} eyebrow={greeting(now)} title={`${possessive(activePet.name)} meals`} />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          title={`${possessive(activePet.name)} meal plan`}
          subtitle={subtitleBits.join(' · ')}
          leading={<HeroAvatar pet={activePet} size={56} />}
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
                      subtitleMono
                  onPress={done ? undefined : () => handleMarkDone(meal)}
                  divider={i < meals.length - 1}
                  right={done ? <DonePill label="Done" /> : <StatusPill due={meal.status === 'due'} />}
                />
              );
            })}
          </Card>
        )}

        <View style={styles.section}>
          <SectionLabel>{possessive(activePet.name)} meds</SectionLabel>
          {meds.length === 0 ? (
            <Pressable
              style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}
              onPress={() => editRoutine('meds')}
              role="button"
              aria-label="Add medication"
              hitSlop={4}
            >
              <Icon name="plus" size={16} color={accent.ink} strokeWidth={1.9} />
              <Text style={styles.quietText}>Add medication</Text>
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
                    right={given ? <DonePill label="Given" /> : <StatusPill due={due} />}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: TAB_BAR_CLEARANCE },
  hero: { marginBottom: 24 },
  section: { marginTop: 24 },
  pressed: { opacity: 0.7 },
  accentPill: { borderWidth: 1, borderColor: accent.line },
  mutedPill: { borderWidth: 1, borderColor: glass.border2 },
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 8,
  },
  quietText: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },
  overlay: { flex: 1, backgroundColor: glass.scrimDark, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: surface.solid,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.border,
    padding: 20,
    ...shadow.hero,
  },
  dialogTitle: { fontSize: 17, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.35, marginBottom: 8 },
  dialogBody: { fontSize: 13.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 20, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 8 },
  dialogBtn: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: glass.strong, borderWidth: 1, borderColor: glass.border2 },
  cancelBtnText: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  confirmBtn: { backgroundColor: accent.primary },
  confirmBtnText: { fontSize: 14, fontFamily: fonts.medium, color: accent.onAccent },
});
