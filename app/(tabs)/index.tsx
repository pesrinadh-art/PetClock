import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ink, space, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { PetSwitcher } from '../../components/PetSwitcher';
import { PetCard } from '../../components/PetCard';
import { MealTimeBanner } from '../../components/MealTimeBanner';
import { NudgeBanner } from '../../components/NudgeBanner';
import { UpcomingSection } from '../../components/UpcomingSection';
import { LogButtons } from '../../components/LogButtons';
import { Banner, Card, ListRow, PetEmptyState, Screen, SectionLabel } from '../../components/ui';
import type { IconName } from '../../components/Icon';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/petSchedule';
import { didPetGo, friendlyAgo, greeting, isBirthday, petDayTitle, possessive } from '../../lib/petVoice';
import type { LogEntry } from '../../data/mockData';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today 11:44 AM" · "Yesterday 8:00 PM" · "Mon 8:00 AM" this week · "Jul 3 8:00 AM" older. */
function formatRecent(occurredAt: string, now: Date): string {
  const d = new Date(occurredAt);
  const clock = formatClock(d);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (dayDiff <= 0) return `Today at ${clock}`;
  if (dayDiff === 1) return `Yesterday at ${clock}`;
  if (dayDiff < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} at ${clock}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${clock}`;
}

/** The three log types the Home summary distils to, with their drawn icon + tone. */
const RECENT_ROWS: { type: 'pee' | 'poo' | 'food'; label: string; icon: IconName; tone: Tone }[] = [
  { type: 'pee', label: 'Last pee', icon: 'drop', tone: 'pee' },
  { type: 'poo', label: 'Last poo', icon: 'poo', tone: 'poo' },
  { type: 'food', label: 'Last meal', icon: 'bowl', tone: 'food' },
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
      <Screen header={<TopNavBar />} scroll={false} tabBar>
        <PetEmptyState
          icon="paw"
          title="Let's meet your pet"
          body="Add your first pet and we'll help you keep track of their day: potty breaks, meals, meds and vet visits."
          action={{ label: 'Add your first pet', icon: 'plus', onPress: () => router.push('/add-pet') }}
        />
      </Screen>
    );
  }

  const birthday = isBirthday(activePet.birthdate, now);

  return (
    <Screen
      tabBar
      header={
        <>
          <TopNavBar pet={activePet} eyebrow={greeting(now)} title={petDayTitle(activePet.name, now)} />
          <PetSwitcher pets={pets} activeId={activePetId} onSelect={setActivePetId} />
        </>
      }
    >
      {birthday ? (
        <Banner
          tone="pet"
          icon="cake"
          title={`Happy birthday, ${activePet.name}!`}
          body="A perfect day for an extra treat and a long cuddle."
          compact
          style={styles.birthday}
        />
      ) : null}

      <PetCard pet={activePet} />

      {/* Meal-time prompt: only while a meal is actually due. */}
      <MealTimeBanner pet={activePet} />

      {/* Quick log: the most common action on Home, one tap per tile. The in-app break/med
          nudge sits right above the tiles (it renders null when nothing is due). */}
      <View>
        <SectionLabel hint="Tap to log now. Press and hold to pick a time.">
          {didPetGo(activePet.name)}
        </SectionLabel>
        <NudgeBanner pet={activePet} />
        <LogButtons
          pet={activePet}
          now={now}
          lastLogged={{
            pee: recentByType.pee?.occurredAt ?? null,
            poo: recentByType.poo?.occurredAt ?? null,
            food: recentByType.food?.occurredAt ?? null,
          }}
        />
      </View>

      {/* Coming up: predicted breaks, next meal and meds (or the calibrating / setup notice). */}
      <UpcomingSection pet={activePet} />

      <View style={styles.section}>
        <SectionLabel
          action={{
            label: 'See all',
            onPress: () => router.push(`/pet/${activePet.id}/history`),
            accessibilityLabel: `See all of ${possessive(activePet.name)} logs`,
          }}
        >
          Recent
        </SectionLabel>
        {/* Compact summary: the last pee, poo and meal — full history lives behind "See all". */}
        <Card>
          {RECENT_ROWS.map((row, i) => {
            const log = recentByType[row.type];
            return (
              <ListRow
                key={row.type}
                icon={row.icon}
                tone={row.tone}
                title={row.label}
                subtitle={log ? formatRecent(log.occurredAt, now) : `Nothing logged for ${activePet.name} yet`}
                right={log ? <Text style={styles.ago}>{friendlyAgo(log.occurredAt, now)}</Text> : undefined}
                divider={i < RECENT_ROWS.length - 1}
              />
            );
          })}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  birthday: { marginBottom: space.sm },
  section: { marginTop: space.section },
  ago: { ...type.caption, fontSize: 13.5, color: ink.muted },
});
