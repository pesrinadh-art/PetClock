import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetCard } from '../../components/PetCard';
import { MealTimeBanner } from '../../components/MealTimeBanner';
import { NudgeBanner } from '../../components/NudgeBanner';
import { UpcomingSection } from '../../components/UpcomingSection';
import { LogButtons } from '../../components/LogButtons';
import { Timeline } from '../../components/Timeline';
import { SectionTitle } from '../../components/SectionTitle';
import { EmptyState } from '../../components/EmptyState';
import { type LogType } from '../../data/mockData';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useNow } from '../../hooks/useNow';

// Home only logs pee/poo directly; icon/label are derived at the view edge now (Δ3).
const LOG_TYPES: Record<string, LogType> = {
  pee: 'pee',
  poo: 'poo',
};

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HomeScreen() {
  const { pets, activePet, activePetId, setActivePetId, getFeedTimesForPet } = usePets();
  const { getLogsForPet, addLog } = useLogs();
  const now = useNow();

  if (!activePet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopNavBar />
        <EmptyState icon="🐾" title="No pets yet" body="Add your first pet to start tracking their day." />
      </SafeAreaView>
    );
  }

  const handleLog = (key: string) => {
    const type = LOG_TYPES[key];
    if (!type) return;
    addLog(activePet.id, { type });
  };

  const petLogs = getLogsForPet(activePet.id);
  const feedTimes = getFeedTimesForPet(activePet.id);
  const todaysLogs = useMemo(() => {
    const todayStart = startOfDay(now);
    return petLogs.filter((l) => !l.deletedAt && new Date(l.occurredAt).getTime() >= todayStart);
  }, [petLogs, now]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <PetCard pet={activePet} />
        {/* Flagship in-app break/med nudge, computed from prediction (works even if the OS push
            was suppressed/missed/denied). Meals stay with MealTimeBanner below (no duplication). */}
        <NudgeBanner pet={activePet} />
        <MealTimeBanner pet={activePet} />

        <SectionTitle>Upcoming</SectionTitle>
        <UpcomingSection pet={activePet} />
        <View style={{ height: 18 }} />

        <SectionTitle>Log Now</SectionTitle>
        <LogButtons pet={activePet} onLog={handleLog} />

        <SectionTitle>Today's Log</SectionTitle>
        <Timeline entries={todaysLogs} feedTimes={feedTimes} now={now} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
});
