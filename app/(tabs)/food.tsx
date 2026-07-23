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
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { getTodaysMeals, getTodaysMedications } from '../../lib/petSchedule';

export default function FoodScreen() {
  const { pets, activePet, activePetId, setActivePetId } = usePets();
  const { getLogsForPet } = useLogs();

  const now = new Date();
  const meals = getTodaysMeals(activePet, now, getLogsForPet(activePet.id));
  const medications = getTodaysMedications(activePet, now);
  const mealsDone = meals.filter((m) => m.status === 'done').length;

  const editPet = () => router.push({ pathname: '/add-pet', params: { petId: activePet.id } });

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
          <Pressable style={({ pressed }) => [styles.notice, pressed && styles.noticePressed]} onPress={editPet}>
            <Text style={styles.noticeIcon}>🍽️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>No meal times set</Text>
              <Text style={styles.noticeBody}>Add {activePet.name}'s feeding schedule to see it here.</Text>
            </View>
            <Text style={styles.noticeChevron}>›</Text>
          </Pressable>
        ) : (
          meals.map((meal) => <ScheduleRow key={meal.id} item={meal} accent={colors.food} accentLight={colors.foodLight} />)
        )}

        <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]} onPress={editPet}>
          <Text style={styles.addBtnText}>➕ Edit Meal Times</Text>
        </Pressable>

        <View style={{ height: 20 }} />

        <SectionTitle>Medications</SectionTitle>
        {medications.length === 0 ? (
          <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]} onPress={editPet}>
            <Text style={styles.addBtnText}>➕ Add Medication</Text>
          </Pressable>
        ) : (
          <>
            {medications.map((med) => (
              <ScheduleRow key={med.id} item={med} accent={colors.medicine} accentLight={colors.medicineLight} />
            ))}
            <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]} onPress={editPet}>
              <Text style={styles.addBtnText}>➕ Edit Medications</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
});
