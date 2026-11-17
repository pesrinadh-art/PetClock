import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { green, ink, logTint, surface, terracotta } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar, greeting } from '../../components/TopNavBar';
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
import { formatAgo } from '../../lib/formatAgo';
import type { LogEntry } from '../../data/mockData';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today at 11:44 AM" · "Yesterday at 8:00 PM" · "Mon at 8:00 AM" this week · "Jul 3 at 8:00 AM" older. */
function formatRecent(occurredAt: string, now: Date): string {
  const d = new Date(occurredAt);
  const clock = formatClock(d);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (dayDiff <= 0) return `Today at ${clock}`;
  if (dayDiff === 1) return `Yesterday at ${clock}`;
  if (dayDiff < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} at ${clock}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${clock}`;
}

/** The three log types the Home "Recent" summary distils to, with their drawn icon + tint. */
const RECENT_ROWS: { type: LogEntry['type']; label: string; icon: IconName; bg: string; fg: string }[] = [
  { type: 'pee', label: 'Last pee', icon: 'drop', bg: logTint.peeBg, fg: logTint.peeInk },
  { type: 'poo', label: 'Last poo', icon: 'poo', bg: logTint.pooBg, fg: logTint.pooInk },
  { type: 'food', label: 'Last meal', icon: 'bowl', bg: terracotta.tint, fg: terracotta.primary },
];

export default function HomeScreen() {
  const { pets, activePet, activePetId, setActivePetId } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();

  // Every hook must run on every render — compute BEFORE any early return, so the hook order
  // stays stable when activePet flips to null (e.g. after the last pet is removed).
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
        <TopNavBar eyebrow={greeting(now)} title="Today" />
        <EmptyState icon="🐾" title="No pets yet" body="Add your first pet to start tracking their day." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar pet={activePet} eyebrow={greeting(now)} title={`${activePet.name}'s day`} />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <PetCard pet={activePet} />

        {/* Quick log: the prediction nudge line (renders only when a break is due) + the
            Pee / Poo / Both / Fed tiles with their last-logged times. */}
        <SectionLabel sub="Tap to log now. Press and hold to pick a time.">Did {activePet.name} go?</SectionLabel>
        <NudgeBanner pet={activePet} />
        <LogButtons pet={activePet} />
        {/* Terracotta "meal is due" card — only while a meal is actually due. */}
        <MealTimeBanner pet={activePet} />

        {/* Predicted breaks, next meal and meds (or the "Learning Mochi's rhythm" card). */}
        <UpcomingSection pet={activePet} />

        <View style={styles.section}>
          <SectionLabel
            right={
              <Pressable
                onPress={() => router.push(`/pet/${activePet.id}/history`)}
                role="button"
                aria-label={`See ${activePet.name}'s diary`}
                hitSlop={8}
              >
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            }
          >
            Recent
          </SectionLabel>
          {/* Compact summary: the last Pee, Poo and meal. The full diary lives behind "See all". */}
          <Card>
            {RECENT_ROWS.map((row, i) => {
              const log = recentByType[row.type as 'pee' | 'poo' | 'food'];
              return (
                <ListRow
                  key={row.type}
                  icon={row.icon}
                  iconBg={row.bg}
                  iconColor={row.fg}
                  iconLarge
                  title={row.label}
                  subtitle={log ? formatRecent(log.occurredAt, now) : 'No logs yet'}
                  right={
                    log ? (
                      <Text style={styles.recentAgo}>
                        {formatAgo(now.getTime() - new Date(log.occurredAt).getTime())}
                      </Text>
                    ) : undefined
                  }
                  showChevron={false}
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 80 },
  section: { marginTop: 24 },
  seeAll: { fontSize: 13, fontFamily: fonts.bold, color: green.primary },
  recentAgo: { fontSize: 12.5, fontFamily: fonts.semiBold, color: ink.muted },
});
