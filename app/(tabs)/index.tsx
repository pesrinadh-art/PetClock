import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { green, ink, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetCard } from '../../components/PetCard';
import { MealTimeBanner } from '../../components/MealTimeBanner';
import { NudgeBanner } from '../../components/NudgeBanner';
import { UpcomingSection } from '../../components/UpcomingSection';
import { LogButtons } from '../../components/LogButtons';
import { Timeline } from '../../components/Timeline';
import { EmptyState } from '../../components/EmptyState';
import { Card, SectionLabel } from '../../components/ui';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useSession } from '../../context/SessionContext';
import { useNow } from '../../hooks/useNow';
import { getPetStatus } from '../../lib/petSchedule';

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HomeScreen() {
  const { pets, activePet, activePetId, setActivePetId, getFeedTimesForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const { session } = useSession();
  const now = useNow();
  const currentUserId = session?.user?.id ?? null;

  // Every hook must run on every render — compute BEFORE any early return, so the hook order
  // stays stable when activePet flips to null (e.g. after "Reset all data" clears every pet).
  // Calling useMemo after the early return crashed the app on reset.
  const petLogs = activePet ? getLogsForPet(activePet.id) : [];
  const todaysLogs = useMemo(() => {
    const todayStart = startOfDay(now);
    return petLogs.filter((l) => !l.deletedAt && new Date(l.occurredAt).getTime() >= todayStart);
  }, [petLogs, now]);

  if (!activePet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopNavBar />
        <EmptyState icon="🐾" title="No pets yet" body="Add your first pet to start tracking their day." />
      </SafeAreaView>
    );
  }

  const feedTimes = getFeedTimesForPet(activePet.id);
  const status = getPetStatus(activePet, feedTimes);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <PetCard pet={activePet} />

        {/* Onboarding notices (calibrating / needs-info) only — the ready-state reminder strip is
            replaced on 2a by the hero "Next break" stat and the quick-log nudge line. */}
        {status.kind !== 'ready' && (
          <View style={styles.section}>
            <UpcomingSection pet={activePet} />
          </View>
        )}

        {/* Quick log card: prediction nudge line (NudgeBanner) + the pee/poo/both/fed tiles. */}
        <View style={styles.section}>
          <SectionLabel>Quick log</SectionLabel>
          <Card padded>
            {/* Flagship in-app break/med nudge, computed from prediction (works even if the OS push
                was suppressed/missed/denied). Renders null when nothing is due. */}
            <NudgeBanner pet={activePet} />
            <LogButtons pet={activePet} />
          </Card>
          {/* Meals stay with MealTimeBanner (no duplication); it renders the terracotta attention
              card only while a meal is actually due. */}
          <MealTimeBanner pet={activePet} />
        </View>

        <View style={styles.section}>
          <SectionLabel
            right={
              <Pressable
                onPress={() => router.push(`/pet/${activePet.id}/history`)}
                role="button"
                aria-label={`See all of ${activePet.name}'s logs`}
                hitSlop={8}
              >
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            }
          >
            Today's logs
          </SectionLabel>
          {todaysLogs.length > 0 ? (
            <Timeline
              entries={todaysLogs}
              feedTimes={feedTimes}
              now={now}
              currentUserId={currentUserId}
            />
          ) : (
            <Card padded>
              <Text style={styles.emptyLogs}>No logs yet today — tap a quick-log tile above.</Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  section: { marginTop: 18 },
  seeAll: { fontSize: 11.5, fontFamily: fonts.semiBold, color: green.primary },
  emptyLogs: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center' },
});
