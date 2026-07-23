import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetCard } from '../../components/PetCard';
import { MealTimeBanner } from '../../components/MealTimeBanner';
import { UpcomingSection } from '../../components/UpcomingSection';
import { LogButtons } from '../../components/LogButtons';
import { Timeline } from '../../components/Timeline';
import { SectionTitle } from '../../components/SectionTitle';
import { EmptyState } from '../../components/EmptyState';
import { type TimelineEntry } from '../../data/mockData';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';

const LOG_META: Record<string, { icon: string; label: string; type: TimelineEntry['type'] }> = {
  pee: { icon: '💧', label: 'Pee', type: 'pee' },
  poo: { icon: '💩', label: 'Poo', type: 'poo' },
};

export default function HomeScreen() {
  const { pets, activePet, activePetId, setActivePetId } = usePets();
  const { getLogsForPet, addLog } = useLogs();

  if (!activePet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopNavBar />
        <EmptyState icon="🐾" title="No pets yet" body="Add your first pet to start tracking their day." />
      </SafeAreaView>
    );
  }

  const handleLog = (key: string) => {
    const meta = LOG_META[key];
    if (!meta) return;
    addLog(activePet.id, { type: meta.type, icon: meta.icon, label: meta.label, sub: 'Logged just now' });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <PetCard pet={activePet} />
        <MealTimeBanner pet={activePet} />

        <SectionTitle>Upcoming</SectionTitle>
        <UpcomingSection pet={activePet} />
        <View style={{ height: 18 }} />

        <SectionTitle>Log Now</SectionTitle>
        <LogButtons pet={activePet} onLog={handleLog} />

        <SectionTitle>Today's Log</SectionTitle>
        <Timeline entries={getLogsForPet(activePet.id)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
});
