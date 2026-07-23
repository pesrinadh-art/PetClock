import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { HeroCard } from '../../components/HeroCard';
import { SectionTitle } from '../../components/SectionTitle';
import { ScheduleRow } from '../../components/ScheduleRow';
import { EmptyState } from '../../components/EmptyState';
import { AppModal } from '../../components/AppModal';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { getTodaysMeals, getTodaysMedications, type ScheduleRowItem } from '../../lib/petSchedule';

const HOUR_MS = 60 * 60 * 1000;

export default function FoodScreen() {
  const { pets, activePet, activePetId, setActivePetId } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  // A meal tapped well before its scheduled time waits here for confirmation before logging.
  const [pendingMeal, setPendingMeal] = useState<ScheduleRowItem | null>(null);

  if (!activePet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopNavBar />
        <EmptyState icon="🍽️" title="No pets yet" body="Add a pet to plan their meals and medications." />
      </SafeAreaView>
    );
  }

  const now = new Date();
  const meals = getTodaysMeals(activePet, now, getLogsForPet(activePet.id));
  const medications = getTodaysMedications(activePet, now);
  const mealsDone = meals.filter((m) => m.status === 'done').length;

  const editPet = () => router.push({ pathname: '/add-pet', params: { petId: activePet.id } });

  // Logs a food entry for the meal — mirrors MealTimeBanner's "Done Feeding" call so the row
  // flips to "✓ Done" (getTodaysMeals matches the log to this slot by name).
  const logMeal = (meal: ScheduleRowItem) => {
    addLog(activePet.id, { type: 'food', icon: meal.icon, label: meal.name, sub: 'Logged just now' });
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
      <TopNavBar />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          colorsGradient={[colors.food, '#D45F35']}
          watermark="🍽️"
          title={`${activePet.name}'s Food`}
          sub={
            meals.length > 0
              ? `${meals.length} meal${meals.length === 1 ? '' : 's'}/day · ${mealsDone} done · ${meals.length - mealsDone} remaining`
              : 'No feed times set yet'
          }
          stats={[
            { value: meals.length > 0 ? `${meals.length}x` : '—', label: 'Per Day' },
            { value: meals.length > 0 ? `${mealsDone}/${meals.length}` : '—', label: 'Meals Today' },
            { value: medications.length > 0 ? String(medications.length) : '—', label: 'Medications' },
          ]}
        />

        <SectionTitle>Today's Meals</SectionTitle>
        {meals.length === 0 ? (
          <Pressable
            style={({ pressed }) => [styles.notice, pressed && styles.noticePressed]}
            onPress={editPet}
            accessibilityRole="button"
            accessibilityLabel={`Set up ${activePet.name}'s meal times`}
          >
            <Text style={styles.noticeIcon}>🍽️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>No meal times set</Text>
              <Text style={styles.noticeBody}>Add {activePet.name}'s feeding schedule to see it here.</Text>
            </View>
            <Text style={styles.noticeChevron}>›</Text>
          </Pressable>
        ) : (
          meals.map((meal) => (
            <ScheduleRow
              key={meal.id}
              item={meal}
              accent={colors.food}
              accentLight={colors.foodLight}
              onLogNow={() => handleMarkDone(meal)}
              logAccessibilityLabel={`Mark ${meal.name} as fed for ${activePet.name}`}
            />
          ))
        )}

        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={editPet}
          accessibilityRole="button"
          accessibilityLabel="Edit meal times"
        >
          <Text style={styles.addBtnText}>➕ Edit Meal Times</Text>
        </Pressable>

        <View style={{ height: 20 }} />

        <SectionTitle>Medications</SectionTitle>
        {medications.length === 0 ? (
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={editPet}
            accessibilityRole="button"
            accessibilityLabel="Add medication"
          >
            <Text style={styles.addBtnText}>➕ Add Medication</Text>
          </Pressable>
        ) : (
          <>
            {medications.map((med) => (
              <ScheduleRow key={med.id} item={med} accent={colors.medicine} accentLight={colors.medicineLight} />
            ))}
            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
              onPress={editPet}
              accessibilityRole="button"
              accessibilityLabel="Edit medications"
            >
              <Text style={styles.addBtnText}>➕ Edit Medications</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

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
                accessibilityRole="button"
                accessibilityLabel="Not yet"
              >
                <Text style={styles.cancelBtnText}>Not yet</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.confirmBtn, pressed && styles.pressed]}
                onPress={confirmPendingMeal}
                accessibilityRole="button"
                accessibilityLabel={pendingMeal ? `Feed ${pendingMeal.name} now for ${activePet.name}` : 'Feed now'}
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
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  addBtn: {
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnPressed: { backgroundColor: colors.sagePale, borderColor: colors.sage },
  addBtnText: { fontSize: 14, fontFamily: fonts.bold, color: colors.stoneMid },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.food,
    backgroundColor: colors.foodLight,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 4,
    ...shadow.sm,
  },
  noticePressed: { opacity: 0.8 },
  noticeIcon: { fontSize: 20 },
  noticeTitle: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 3 },
  noticeBody: { fontSize: 12, color: colors.stoneMid, lineHeight: 17 },
  noticeChevron: { fontSize: 20, color: colors.food, fontFamily: fonts.bold, alignSelf: 'center' },
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
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow.card,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: colors.stoneMid, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  pressed: { opacity: 0.8 },
  cancelBtn: { backgroundColor: colors.sagePale },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },
  confirmBtn: { backgroundColor: colors.food },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
});
