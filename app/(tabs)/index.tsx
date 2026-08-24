import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { green, ink, logTint, surface, terracotta } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetCard } from '../../components/PetCard';
import { MealTimeBanner } from '../../components/MealTimeBanner';
import { NudgeBanner } from '../../components/NudgeBanner';
import { UpcomingSection } from '../../components/UpcomingSection';
import { LogButtons } from '../../components/LogButtons';
import { EmptyState } from '../../components/EmptyState';
import { Card, ListRow, SectionLabel } from '../../components/ui';
import type { IconName } from '../../components/Icon';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/petSchedule';
import type { LogEntry } from '../../data/mockData';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "11:44 AM" today · "Yesterday 8:00 PM" · "Mon 8:00 AM" this week · "Jul 3 8:00 AM" older. */
function formatRecent(occurredAt: string, now: Date): string {
  const d = new Date(occurredAt);
  const clock = formatClock(d);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (dayDiff <= 0) return clock;
  if (dayDiff === 1) return `Yesterday ${clock}`;
  if (dayDiff < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${clock}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${clock}`;
}

/** The three log types the Home summary distils to, with their drawn icon + tint (per design). */
const RECENT_ROWS: { type: LogEntry['type']; label: string; icon: IconName; bg: string; fg: string }[] = [
  { type: 'pee', label: 'Pee', icon: 'drop', bg: logTint.peeBg, fg: logTint.peeInk },
  { type: 'poo', label: 'Poo', icon: 'poo', bg: logTint.pooBg, fg: logTint.pooInk },
  { type: 'food', label: 'Fed', icon: 'bowl', bg: terracotta.tint, fg: terracotta.primary },
];

export default function HomeScreen() {
  const { pets, activePet, activePetId, setActivePetId } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();

  // Every hook must run on every render — compute BEFORE any early return, so the hook order
  // stays stable when activePet flips to null (e.g. after "Reset all data" clears every pet).
  // Calling useMemo after the early return crashed the app on reset.
  const petLogs = activePet ? getLogsForPet(activePet.id) : [];

  // The most-recent non-deleted log of each summarised type (Pee / Poo / Fed), across all
  // history — this is "last", not "today". null when that type was never logged.
  const recentByType = useMemo(() => {
    const active = petLogs.filter((l) => !l.deletedAt);
    const latestOf = (type: LogEntry['type']): LogEntry | null =>
      active
        .filter((l) => l.type === type)
        .reduce<LogEntry | null>(
          (best, l) =>
            !best || new Date(l.occurredAt).getTime() > new Date(best.occurredAt).getTime() ? l : best,
          null,
        );
    return { pee: latestOf('pee'), poo: latestOf('poo'), food: latestOf('food') };
  }, [petLogs]);

  if (!activePet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopNavBar />
        <EmptyState icon="🐾" title="No pets yet" body="Add your first pet to start tracking their day." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <PetCard pet={activePet} />

        {/* Upcoming reminders — predicted pee/poo breaks, next meal and medications (or the
            calibrating / needs-info notice). Manages its own top margin; renders nothing when
            a ready pet has nothing upcoming. */}
        <UpcomingSection pet={activePet} />

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
            Recent logs
          </SectionLabel>
          {/* Compact summary: the last Pee, Poo and Fed with their times — not a full timeline.
              Full history lives behind "See all". */}
          <Card>
            {RECENT_ROWS.map((row, i) => {
              const log = recentByType[row.type as 'pee' | 'poo' | 'food'];
              return (
                <ListRow
                  key={row.type}
                  icon={row.icon}
                  iconBg={row.bg}
                  iconColor={row.fg}
                  title={row.label}
                  right={
                    <Text style={log ? styles.recentTime : styles.recentEmpty}>
                      {log ? formatRecent(log.occurredAt, now) : 'No logs yet'}
                    </Text>
                  }
                  divider={i < RECENT_ROWS.length - 1}
                />
              );
            })}
          </Card>
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
  recentTime: { fontSize: 12.5, fontFamily: fonts.bold, color: ink.muted },
  recentEmpty: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.faint },
});
