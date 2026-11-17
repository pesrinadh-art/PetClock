import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface, green, ink, line, category, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';
import { Card, HeroAvatar, HeroCard, ListRow, SectionLabel, Pill, type Stat } from '../../components/ui';
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

/** Maps a derived meal-slot name to a drawn icon + its role tint (design: sun=breakfast, moon=dinner). */
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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Pet" fallback="/(tabs)/pets" />
        <View style={styles.empty}>
          <Icon name="paw" size={40} color={ink.faint} />
          <Text style={styles.emptyTitle}>Pet not found</Text>
          <Text style={styles.emptyBody}>This pet may have been removed.</Text>
        </View>
      </SafeAreaView>
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
    ? { label: 'Scheduled', color: green.primary }
    : vaccineAppts.length > 0
      ? { label: 'On file', color: ink.muted }
      : { label: 'None yet', color: ink.faint };

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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title={pet.name}
        subtitle={`${pet.name}'s profile`}
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
          leading={<HeroAvatar pet={pet} size={96} />}
        >
          {kind && (
            <View style={styles.kindChip}>
              <Text style={styles.kindText}>{kind}</Text>
            </View>
          )}
        </HeroCard>

        {/* ── Meals ── */}
        <View style={styles.section}>
          <SectionLabel right={seeAll('Meal plan', openMealPlan, `Open ${pet.name}'s meal plan`)}>
            {pet.name}'s meals
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
                          <Pressable
                            onPress={() => handleMarkDone(meal)}
                            hitSlop={6}
                            role="button"
                            aria-label={`Mark ${meal.name} as fed for ${pet.name}`}
                          >
                            {({ pressed }) => (
                              <Pill
                                label="Log"
                                bg={green.mid}
                                color={ink.onDark}
                                style={pressed ? { opacity: 0.8 } : undefined}
                              />
                            )}
                          </Pressable>
                        )
                      }
                    />
                  );
                })}
              </Card>
              <DashedAction icon="clock" label="Edit meal times" onPress={() => editPet('routine')} />
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
          <SectionLabel>{pet.name}'s meds</SectionLabel>
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
          <DashedAction icon="plus" label="Add medication" onPress={() => editPet('meds')} />
        </View>

        {/* ── Records: the care diary (logs + vet visits) and vaccinations ── */}
        <View style={styles.section}>
          <SectionLabel>Records</SectionLabel>
          <Card>
            <ListRow
              icon="clock"
              iconBg={green.tint}
              iconColor={green.primary}
              iconLarge
              title={`${pet.name}'s diary`}
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
          aria-label={`Edit ${pet.name}'s routine`}
        >
          <Icon name="pencil" size={18} color={green.primary} strokeWidth={2.2} />
          <Text style={styles.footerText}>Edit {pet.name}'s routine</Text>
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
    </SafeAreaView>
  );
}

/** The dashed "Edit meal times" / "Add medication" affordance. */
function DashedAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.dashed, pressed && styles.dashedPressed]}
      onPress={onPress}
      role="button"
      aria-label={label}
    >
      <Icon name={icon} size={15} color={ink.muted} strokeWidth={2} />
      <Text style={styles.dashedText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },

  kindChip: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  kindText: { fontSize: 12.5, fontFamily: fonts.bold, color: '#ffffff' },

  section: { marginTop: 26 },
  seeAll: { fontSize: 13, fontFamily: fonts.bold, color: green.primary },
  recordValue: { fontSize: 12.5, fontFamily: fonts.semiBold, color: ink.faint2 },

  dashed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },
  dashedPressed: { opacity: 0.6 },
  dashedText: { fontSize: 13, fontFamily: fonts.semiBold, color: ink.muted },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: line.border,
    backgroundColor: surface.app,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.card,
    ...shadow.sm,
  },
  footerText: { fontSize: 16, fontFamily: fonts.bold, color: green.primary },

  // Early-feeding confirm dialog.
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: 20,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: green.tint },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: green.primary },
  confirmBtn: { backgroundColor: green.mid },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: ink.onDark },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary },
  emptyBody: { fontSize: 13, color: ink.muted, textAlign: 'center', lineHeight: 19 },
});
