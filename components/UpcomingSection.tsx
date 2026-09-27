import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ink, space, type Tone } from '../theme/colors';
import { type } from '../theme/fonts';
import { Banner, Card, ListRow, Pill, SectionLabel } from './ui';
import type { IconName } from './Icon';
import type { Pet } from '../data/mockData';
import {
  formatTimeRange,
  getPetStatus,
  getUpcomingForPet,
  getUpcomingMedications,
  type UpcomingItem,
} from '../lib/petSchedule';
import { friendlyAgo, friendlyIn, gentleLate } from '../lib/petVoice';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';

/** Icon + role tone per upcoming-item type. */
const ITEM_STYLE: Record<UpcomingItem['type'], { icon: IconName; tone: Tone }> = {
  pee: { icon: 'drop', tone: 'pee' },
  poo: { icon: 'poo', tone: 'poo' },
  food: { icon: 'bowl', tone: 'food' },
  medication: { icon: 'pill', tone: 'med' },
};

/**
 * One upcoming reminder as a row: tinted icon tile, label, time window, and a
 * status pill on the right — "in 40 min", "Now", or a gentle amber "A little
 * late" (never red). Late state pairs colour with the pill text + clock icon.
 */
function UpcomingRow({ item, now, divider }: { item: UpcomingItem; now: Date; divider: boolean }) {
  const s = ITEM_STYLE[item.type];
  const late = item.kind === 'overdue';
  const due = item.kind === 'due';
  const lateText = gentleLate(Math.round(item.overdueBy / 60000));
  const pill = late ? (
    <Pill tone="attention" icon="clock" label={lateText.charAt(0).toUpperCase() + lateText.slice(1)} />
  ) : due ? (
    <Pill tone="pet" icon="bell" label="Now" />
  ) : (
    <Text style={styles.when}>{friendlyIn(item.timeStart, now)}</Text>
  );
  return (
    <ListRow
      icon={s.icon}
      tone={late ? 'attention' : s.tone}
      title={item.label}
      subtitle={
        late
          ? `${formatTimeRange(item.timeStart, item.timeEnd)} · due ${friendlyAgo(now.getTime() - item.overdueBy, now)}`
          : formatTimeRange(item.timeStart, item.timeEnd)
      }
      right={pill}
      divider={divider}
    />
  );
}

/** A card of upcoming-reminder rows. Renders nothing when there are none. */
function UpcomingList({ items, now }: { items: UpcomingItem[]; now: Date }) {
  if (items.length === 0) return null;
  return (
    <Card>
      {items.map((item, i) => (
        <UpcomingRow key={item.id} item={item} now={now} divider={i < items.length - 1} />
      ))}
    </Card>
  );
}

export function UpcomingSection({ pet }: { pet: Pet }) {
  const { getLogsForPet } = useLogs();
  const { getFeedTimesForPet, getMedicationsForPet } = usePets();
  const feedTimes = getFeedTimesForPet(pet.id);
  const medications = getMedicationsForPet(pet.id);
  const status = getPetStatus(pet, feedTimes);
  const now = useNow();

  // Medications are user-specified fixed times, not something we're learning — so they
  // show up regardless of whether the pee/poop calibration below is done.
  const medicationItems = getUpcomingMedications(medications, now);
  const openSchedule = () => router.push({ pathname: '/add-pet', params: { petId: pet.id } });

  if (status.kind === 'calibrating') {
    return (
      <View style={styles.section}>
        <SectionLabel>Coming up for {pet.name}</SectionLabel>
        <View style={styles.stack}>
          <Banner
            tone="pet"
            icon="sparkle"
            title={`Learning ${pet.name}'s rhythm`}
            body={`Day ${status.day} of 3. Log a few pees, poos and meals and we'll start predicting the next break.`}
            secondaryAction={{ label: 'Add schedule now instead', onPress: openSchedule }}
          />
          <UpcomingList items={medicationItems} now={now} />
        </View>
      </View>
    );
  }

  if (status.kind === 'needsInfo') {
    return (
      <View style={styles.section}>
        <SectionLabel>Coming up for {pet.name}</SectionLabel>
        <View style={styles.stack}>
          <Banner
            tone="pet"
            icon="calendar"
            title={`Set up ${pet.name}'s routine`}
            body="Add feeding and potty times and we'll remind you when each one is coming up."
            action={{ label: `Set up ${pet.name}'s routine`, icon: 'arrowRight', onPress: openSchedule }}
          />
          <UpcomingList items={medicationItems} now={now} />
        </View>
      </View>
    );
  }

  // Ready: the predicted pee/poo breaks + next meal (getUpcomingForPet) merged with any
  // medication reminders, soonest first, capped at 5.
  const holdItems = getUpcomingForPet(pet, feedTimes, getLogsForPet(pet.id), now);
  const items = [...holdItems, ...medicationItems]
    .sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime())
    .slice(0, 5);

  // Tidy empty state: render nothing when there is genuinely nothing upcoming.
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionLabel hint="Our best guess from recent logs">Coming up for {pet.name}</SectionLabel>
      <UpcomingList items={items} now={now} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.section },
  stack: { gap: space.sm },
  when: { ...type.caption, fontSize: 13.5, color: ink.muted },
});
