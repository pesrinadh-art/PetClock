import { useState } from 'react';
import { possessive } from '../../lib/petVoice';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { accent, glass, ink, category, radius, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';
import { Card, HeroAvatar, HeroCard, ListRow, Screen, SectionLabel, Pill, type Stat } from '../../components/ui';
import { AppModal } from '../../components/AppModal';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyActionCard } from '../../components/EmptyActionCard';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useAppointments } from '../../context/AppointmentsContext';
import { getTodaysMeals, formatClock, parseClockTime, type ScheduleRowItem } from '../../lib/petSchedule';
import { kindLabel } from '../../lib/petKinds';
import { useNow } from '../../hooks/useNow';

const HOUR_MS = 60 * 60 * 1000;

/** Maps a derived meal-slot name to a drawn line icon (sun = daytime meals, moon = dinner). */
function mealVisual(name: string): { icon: IconName; bg: string; color: string } {
  switch (name) {
    case 'Dinner':
      return { icon: 'moon', bg: category.dinnerBg, color: category.dinnerInk };
    case 'Breakfast':
    case 'Brunch':
    case 'Lunch':
      return { icon: 'sun', bg: category.breakfastBg, color: category.breakfastInk };
    default:
      return { icon: 'bowl', bg: category.otherBg, color: category.otherInk };
  }
}

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, getFeedTimesForPet, getMedicationsForPet, setActivePetId } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const { appointments } = useAppointments();
  const now = useNow();

  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);

  const pet = pets.find((p) => p.id === id) ?? null;

  if (!pet) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader title="Pet" fallback="/(tabs)/pets" />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="paw" size={24} color={accent.ink} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>Pet not found</Text>
          <Text style={styles.emptyBody}>This pet may have been removed.</Text>
        </View>
      </Screen>
    );
  }

  const feedTimes = getFeedTimesForPet(pet.id);
  const logs = getLogsForPet(pet.id);
  const meds = getMedicationsForPet(pet.id).filter((m) => m.active);
  const activeLogs = logs.filter((l) => !l.deletedAt);
  const meals = getTodaysMeals(feedTimes, now, logs);
  const kind = kindLabel(pet.avatarEmoji);

  // Hero stats — Meals a day · Holds up to · Daily meds.
  const feedCount = meals.length;
  const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
  const stats: Stat[] = [
    { value: feedCount > 0 ? String(feedCount) : '—', label: 'Meals a day' },
    { value: Number.isFinite(tightestHold) ? `${tightestHold}h` : '—', label: 'Holds up to' },
    { value: meds.length > 0 ? String(meds.length) : '—', label: 'Daily meds' },
  ];

  // Vaccinations record — derived honestly from this pet's vaccine appointments.
  const vaccineAppts = appointments.filter(
    (a) => !a.deletedAt && a.type === 'vaccine' && a.petIds.includes(pet.id),
  );
  const upcomingVaccine = vaccineAppts.some((a) => new Date(a.startsAt).getTime() > now.getTime());
  const vaccine = upcomingVaccine
    ? { label: 'Scheduled', color: accent.ink }
    : vaccineAppts.length > 0
      ? { label: 'On file', color: ink.muted }
      : { label: 'None yet', color: ink.muted };

  // Edit opens the 3-step wizard pre-filled; `step` jumps straight to the relevant step.
  const editPet = (step?: 'about' | 'routine' | 'meds') =>
    router.push({ pathname: '/add-pet', params: { petId: pet.id, ...(step ? { step } : {}) } });

  // "Mochi's meals" (meal plan + meds) shows the pet switcher, so select this pet first.
  const openMealPlan = () => {
    setActivePetId(pet.id);
    router.push('/(tabs)/food');
  };

  // Logs a food entry for the meal so the row flips to "Done" (matched by feedTimeId, Δ1).
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

  const seeAll = (label: string, onPress: () => void, aria: string) => (
    <Pressable onPress={onPress} role="button" aria-label={aria} hitSlop={8}>
      <Text style={styles.seeAll}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title={pet.name}
        subtitle={`${possessive(pet.name)} profile`}
        onEdit={() => editPet('about')}
        editLabel={`Edit ${pet.name}`}
        fallback="/(tabs)/pets"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          centered
          title={pet.name}
          subtitle={pet.breed || 'No details yet'}
          stats={stats}
          leading={<HeroAvatar pet={pet} size={84} />}
        >
          {kind && (
            <Pill
              label={kind}
              bg={accent.soft}
              color={accent.ink}
              size="sm"
              style={styles.kindChip}
            />
          )}
        </HeroCard>

        {/* ── Meals ── */}
        <View style={styles.section}>
          <SectionLabel
            sub="Today"
            right={seeAll('Meal plan', openMealPlan, `Open ${possessive(pet.name)} meal plan`)}
          >
            {possessive(pet.name)} meals
          </SectionLabel>
          {meals.length > 0 ? (
            <>
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
                      divider={i < meals.length - 1}
                      right={
                        done ? (
                          <Pill
                            label="Done"
                            size="sm"
                            bg={accent.soft}
                            color={accent.ink}
                            style={styles.accentPill}
                            icon={<Icon name="check" size={12} color={accent.ink} strokeWidth={2.4} />}
                          />
                        ) : (
                          <Pressable
                            onPress={() => handleMarkDone(meal)}
                            hitSlop={6}
                            role="button"
                            aria-label={`Mark ${meal.name} as fed for ${pet.name}`}
                          >
                            {({ pressed }) => (
                              <Pill
                                label="Log"
                                bg={accent.primary}
                                color={accent.onAccent}
                                style={pressed ? styles.logPillPressed : styles.logPill}
                              />
                            )}
                          </Pressable>
                        )
                      }
                    />
                  );
                })}
              </Card>
              <QuietAction icon="clock" label="Edit meal times" onPress={() => editPet('routine')} />
            </>
          ) : (
            <EmptyActionCard
              title={`No meal times for ${pet.name} yet`}
              body="Add them and we'll remind you when it's time to eat."
              actionLabel="Add meal times"
              actionIcon="clock"
              onAction={() => editPet('routine')}
            />
          )}
        </View>

        {/* ── Medications ── */}
        <View style={styles.section}>
          <SectionLabel>{possessive(pet.name)} meds</SectionLabel>
          {meds.length > 0 && (
            <Card>
              {meds.map((med, i) => {
                const t = parseClockTime(med.localTime, now);
                const time = t ? formatClock(t) : med.localTime;
                const subtitle = med.dosage ? `${med.dosage} · ${time}` : `Around ${time}`;
                return (
                  <ListRow
                    key={med.id}
                    icon="pill"
                    iconBg={category.medBg}
                    iconColor={category.medInk}
                    iconLarge
                    title={med.name}
                    subtitle={subtitle}
                    onPress={() => editPet('meds')}
                    divider={i < meds.length - 1}
                  />
                );
              })}
            </Card>
          )}
          <QuietAction icon="plus" label="Add medication" onPress={() => editPet('meds')} />
        </View>

        {/* ── Records: the care diary (logs + vet visits) and vaccinations ── */}
        <View style={styles.section}>
          <SectionLabel>Records</SectionLabel>
          <Card>
            <ListRow
              icon="clock"
              iconLarge
              title={`${possessive(pet.name)} diary`}
              right={<Text style={styles.recordValue}>{activeLogs.length} moments</Text>}
              showChevron
              divider
              onPress={() => router.push({ pathname: '/pet/[id]/history', params: { id: pet.id } })}
            />
            <ListRow
              icon="vaccine"
              iconBg={category.vaccineBg}
              iconColor={category.vaccineInk}
              iconLarge
              title="Vaccinations"
              right={<Text style={[styles.recordValue, { color: vaccine.color }]}>{vaccine.label}</Text>}
              showChevron
              onPress={() => router.push('/(tabs)/appointments')}
            />
          </Card>
        </View>
      </ScrollView>

      {/* Sticky "Edit Mochi's routine" — opens the wizard at the Routine step. */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}
          onPress={() => editPet('routine')}
          role="button"
          aria-label={`Edit ${possessive(pet.name)} routine`}
        >
          <Icon name="pencil" size={17} color={accent.onAccent} strokeWidth={1.9} />
          <Text style={styles.footerText}>Edit {possessive(pet.name)} routine</Text>
        </Pressable>
      </View>

      {/* Early-feeding confirm — preserved from the old Food tab. */}
      <AppModal visible={!!pendingMeal} transparent animationType="fade" onRequestClose={() => setPendingMeal(null)}>
        <Pressable style={styles.overlay} onPress={() => setPendingMeal(null)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>
              Aw, is it my {pendingMeal?.name.toLowerCase()} already? 🐶
            </Text>
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
                onPress={confirmPendingMeal}
                role="button"
                aria-label={pendingMeal ? `Feed ${pendingMeal.name} now for ${pet.name}` : 'Feed now'}
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

/** The quiet accent "Edit meal times" / "Add medication" affordance (design `.btn.quiet.sm`). */
function QuietAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quiet, pressed && styles.quietPressed]}
      onPress={onPress}
      role="button"
      aria-label={label}
      hitSlop={4}
    >
      <Icon name={icon} size={16} color={accent.ink} strokeWidth={1.9} />
      <Text style={styles.quietText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },

  kindChip: { alignSelf: 'center', marginTop: 8, borderWidth: 1, borderColor: accent.line },

  section: { marginTop: 24 },
  seeAll: { fontSize: 13, fontFamily: fonts.regular, color: accent.ink },
  recordValue: { fontSize: 12, fontFamily: fonts.monoRegular, color: ink.muted },

  accentPill: { borderWidth: 1, borderColor: accent.line },
  logPill: { paddingHorizontal: 14 },
  logPillPressed: { paddingHorizontal: 14, opacity: 0.8 },

  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    marginTop: 6,
    minHeight: 36,
    paddingHorizontal: 8,
  },
  quietPressed: { opacity: 0.6 },
  quietText: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
    ...shadow.fab,
  },
  footerText: { fontSize: 15, fontFamily: fonts.medium, color: accent.onAccent },

  // Early-feeding confirm dialog.
  overlay: {
    flex: 1,
    backgroundColor: glass.scrimDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
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

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.35 },
  emptyBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center', lineHeight: 19 },
});
