import { useMemo } from 'react';
import { petDayTitle, possessive } from '../../lib/petVoice';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, ink } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar, greeting } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetCard } from '../../components/PetCard';
import { MealTimeBanner } from '../../components/MealTimeBanner';
import { NudgeBanner } from '../../components/NudgeBanner';
import { UpcomingSection } from '../../components/UpcomingSection';
import { EmptyState } from '../../components/EmptyState';
import { Card, ListRow, Screen, SectionLabel, TAB_BAR_CLEARANCE } from '../../components/ui';
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

/** The three log types the Home "Recent" summary distils to, with their line icon (accent-soft tile). */
const RECENT_ROWS: { type: LogEntry['type']; label: string; icon: IconName }[] = [
  { type: 'pee', label: 'Last pee', icon: 'drop' },
  { type: 'poo', label: 'Last poo', icon: 'poo' },
  { type: 'food', label: 'Last meal', icon: 'bowl' },
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
      <Screen edges={['top']}>
        <TopNavBar eyebrow={greeting(now)} title="Today" />
        <EmptyState icon="🐾" title="No pets yet" body="Add your first pet to start tracking their day." />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <TopNavBar pet={activePet} eyebrow={greeting(now)} title={petDayTitle(activePet.name, now)} />
      <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PetCard pet={activePet} />

        {/* Late-break / med nudge (renders only when something is due): Yes / Not yet / Snooze.
            Logging otherwise lives on the tab bar's "+ Log" button. */}
        <NudgeBanner pet={activePet} />
        {/* "Meal is due" banner — only while a meal is actually due. */}
        <MealTimeBanner pet={activePet} />

        {/* Predicted breaks, next meal and meds (or the "Learning Mochi's rhythm" card). */}
        <UpcomingSection pet={activePet} />

        <View style={styles.section}>
          <SectionLabel
            right={
              <Pressable
                onPress={() => router.push(`/pet/${activePet.id}/history`)}
                role="button"
                aria-label={`See ${possessive(activePet.name)} diary`}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: TAB_BAR_CLEARANCE },
  section: { marginTop: 26 },
  seeAll: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },
  recentAgo: { fontSize: 12.5, fontFamily: fonts.monoRegular, color: ink.muted, letterSpacing: -0.2 },
});
