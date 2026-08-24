import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface, green, ink, line, category, radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';
import { Card, HeroCard, ListRow, SectionLabel, Pill, type Stat } from '../../components/ui';
import { PetAvatar } from '../../components/PetAvatar';
import { AppModal } from '../../components/AppModal';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useAppointments } from '../../context/AppointmentsContext';
import { getTodaysMeals, formatClock, parseClockTime, type ScheduleRowItem } from '../../lib/petSchedule';
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
  const { pets, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const { appointments } = useAppointments();
  const now = useNow();

  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);

  const pet = pets.find((p) => p.id === id) ?? null;

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Pet" />
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

  // Hero stats — Meals/day · Hold time · Medication (screen 2b).
  const feedCount = meals.length;
  const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
  const holdDisplay = Number.isFinite(tightestHold) ? `${tightestHold}h` : '—';
  const stats: Stat[] = [
    { value: feedCount > 0 ? `${feedCount}×` : '—', label: 'Meals/day' },
    { value: holdDisplay, label: 'Hold time' },
    { value: meds.length > 0 ? String(meds.length) : '—', label: 'Medication' },
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

  const editPet = () => router.push({ pathname: '/add-pet', params: { petId: pet.id } });

  // Logs a food entry for the meal — mirrors the old Food tab / MealTimeBanner call so the row
  // flips to "✓ Done" (getTodaysMeals matches the log to this slot by feedTimeId, Δ1).
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title={pet.name} onEdit={editPet} editLabel={`Edit ${pet.name}`} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          title={pet.name}
          subtitle={pet.breed || 'No details yet'}
          stats={stats}
          leading={
            <PetAvatar pet={pet} size={52} emojiSize={24} style={styles.heroAvatar} />
          }
        />

        {/* ── Meal times (the meal logging that used to be the Food tab) ── */}
        <View style={styles.section}>
          <SectionLabel>Meal times</SectionLabel>
          {meals.length > 0 && (
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
          )}
          <DashedAction
            icon="clock"
            label={meals.length > 0 ? 'Edit meal times' : 'Add meal times'}
            onPress={editPet}
          />
        </View>

        {/* ── Medications ── */}
        <View style={styles.section}>
          <SectionLabel>Medications</SectionLabel>
          {meds.length > 0 && (
            <Card>
              {meds.map((med, i) => {
                const t = parseClockTime(med.localTime, now);
                const time = t ? formatClock(t) : med.localTime;
                const subtitle = med.dosage ? `${med.dosage} · ${time}` : time;
                return (
                  <ListRow
                    key={med.id}
                    icon="pill"
                    iconBg={category.medBg}
                    iconColor={category.medInk}
                    iconLarge
                    title={med.name}
                    subtitle={subtitle}
                    onPress={editPet}
                    divider={i < meds.length - 1}
                  />
                );
              })}
            </Card>
          )}
          <DashedAction icon="plus" label="Add medication" onPress={editPet} />
        </View>

        {/* ── Records ── */}
        <View style={styles.section}>
          <SectionLabel>Records</SectionLabel>
          <Card>
            <ListRow
              title="Care history"
              right={<Text style={styles.recordValue}>{activeLogs.length} logs</Text>}
              showChevron
              divider
              onPress={() => router.push({ pathname: '/pet/[id]/history', params: { id: pet.id } })}
            />
            <ListRow
              title="Vaccinations"
              right={<Text style={[styles.recordValue, { color: vaccine.color }]}>{vaccine.label}</Text>}
              showChevron
              onPress={() => router.push('/(tabs)/appointments')}
            />
          </Card>
        </View>
      </ScrollView>

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

function Header({ title, onEdit, editLabel }: { title: string; onEdit?: () => void; editLabel?: string }) {
  return (
    <View style={styles.titleRow}>
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pets'))}
        role="button"
        aria-label="Back"
        hitSlop={8}
      >
        <Icon name="chevronLeft" size={18} color={ink.muted} strokeWidth={2.4} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {onEdit ? (
        <Pressable
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
          onPress={onEdit}
          role="button"
          aria-label={editLabel ?? 'Edit'}
          hitSlop={8}
        >
          <Icon name="pencil" size={17} color={green.primary} strokeWidth={2.2} />
        </Pressable>
      ) : (
        <View style={{ width: 34 }} />
      )}
    </View>
  );
}

/** The dashed "Edit meal times" / "Add medication" affordance from the mockup. */
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontFamily: fonts.extraBold, color: ink.primary, textAlign: 'center', flex: 1, letterSpacing: -0.4 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: green.tint,
    borderWidth: 1,
    borderColor: green.tintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },

  heroAvatar: { backgroundColor: 'rgba(255,255,255,0.16)' },

  section: { marginTop: 18 },

  recordValue: { fontSize: 12, fontFamily: fonts.semiBold, color: ink.faint2 },

  dashed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },
  dashedPressed: { opacity: 0.6 },
  dashedText: { fontSize: 12.5, fontFamily: fonts.semiBold, color: ink.muted },

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
