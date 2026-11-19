import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { possessive } from '../lib/petVoice';
import { router } from 'expo-router';
import { accent, glass, ink, radius, shadow, surface, warn } from '../theme/colors';
import { gentleLate } from '../lib/petVoice';
import { fonts } from '../theme/fonts';
import { SectionLabel } from './ui';
import { Icon, type IconName } from './Icon';
import type { Pet } from '../data/mockData';
import {
  formatTimeRange,
  formatTimeUntil,
  formatTimeUntilCompact,
  getPetStatus,
  getUpcomingForPet,
  getUpcomingMedications,
  type UpcomingItem,
} from '../lib/petSchedule';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';

/** Line icon per upcoming-item type (one accent; late items switch to warn). */
const ITEM_ICON: Record<UpcomingItem['type'], IconName> = {
  pee: 'drop',
  poo: 'poo',
  food: 'bowl',
  medication: 'pill',
};

/**
 * One upcoming reminder as a glass strip item (design v2 `.strip-item`): a line icon, the
 * time range in Geist Mono, the label, and a relative "when" sub. A late item reads gently
 * ("a little late · 20m", "running late · 2h") in warn — never red "Overdue".
 */
function UpcomingCard({ item, now }: { item: UpcomingItem; now: Date }) {
  const overdue = item.kind === 'overdue';
  const sub = overdue
    ? `${gentleLate(Math.floor(item.overdueBy / 60_000))} · ${formatTimeUntilCompact(new Date(now.getTime() + item.overdueBy), now)}`
    : formatTimeUntil(item.timeStart, now);
  return (
    <View style={styles.card}>
      <Icon
        name={ITEM_ICON[item.type]}
        size={18}
        color={overdue ? warn.ink : accent.ink}
        strokeWidth={1.8}
        style={styles.cardIcon}
      />
      <Text numberOfLines={1} style={[styles.time, overdue && styles.timeOverdue]}>
        {formatTimeRange(item.timeStart, item.timeEnd)}
      </Text>
      <Text numberOfLines={1} style={styles.cardLabel}>
        {item.label}
      </Text>
      <Text numberOfLines={1} style={[styles.cardSub, overdue && styles.timeOverdue]}>
        {sub}
      </Text>
    </View>
  );
}

/** A horizontal strip of upcoming-reminder cards. Renders nothing when there are none. */
function UpcomingList({ items, now }: { items: UpcomingItem[]; now: Date }) {
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.stripContent}
    >
      {items.map((item) => (
        <UpcomingCard key={item.id} item={item} now={now} />
      ))}
    </ScrollView>
  );
}

export function UpcomingSection({ pet }: { pet: Pet }) {
  const { getLogsForPet } = useLogs();
  const { getFeedTimesForPet, getMedicationsForPet } = usePets();
  const feedTimes = getFeedTimesForPet(pet.id);
  const medications = getMedicationsForPet(pet.id);
  const status = getPetStatus(pet, feedTimes);
  const now = new Date();

  // Medications are user-specified fixed times, not something we're learning — so they
  // show up regardless of whether the pee/poop calibration below is done.
  const medicationItems = getUpcomingMedications(medications, now);

  const heading = <SectionLabel>Coming up for {pet.name}</SectionLabel>;
  const editRoutine = () => router.push({ pathname: '/add-pet', params: { petId: pet.id, step: 'routine' } });

  if (status.kind === 'calibrating') {
    return (
      <View style={styles.section}>
        {heading}
        <View style={styles.learnCard}>
          <View style={styles.learnIcon}>
            <Icon name="sparkle" size={18} color={accent.ink} strokeWidth={1.8} />
          </View>
          <Text style={styles.learnTitle}>Learning {possessive(pet.name)} rhythm</Text>
          <Text style={styles.noticeBody}>
            Day {status.day} of 3. Log a few pees, poos and meals and we'll start predicting the next break.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.noticeLink, pressed && styles.noticePressed]}
            onPress={editRoutine}
            role="button"
            aria-label={`Add ${possessive(pet.name)} schedule now`}
            hitSlop={4}
          >
            <Text style={styles.noticeLinkText}>Add schedule now instead</Text>
          </Pressable>
        </View>
        <UpcomingList items={medicationItems} now={now} />
      </View>
    );
  }

  if (status.kind === 'needsInfo') {
    return (
      <View style={styles.section}>
        {heading}
        <Pressable onPress={editRoutine} role="button" aria-label={`Set up ${possessive(pet.name)} schedule`}>
          {({ pressed }) => (
            <View style={[styles.learnCard, styles.learnRow, pressed && styles.noticePressed]}>
              <View style={[styles.learnIcon, styles.learnIconInline]}>
                <Icon name="calendar" size={18} color={accent.ink} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.learnTitle}>Set up {possessive(pet.name)} routine</Text>
                <Text style={styles.noticeBody}>
                  We still don't have feeding & potty info. Fill it in to get real upcoming reminders.
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={ink.placeholder} strokeWidth={2} />
            </View>
          )}
        </Pressable>
        <UpcomingList items={medicationItems} now={now} />
      </View>
    );
  }

  // Ready: the predicted pee/poo breaks + next meal (getUpcomingForPet) merged with any
  // medication reminders, soonest first, capped at 5 — rendered as cards on Home.
  const holdItems = getUpcomingForPet(pet, feedTimes, getLogsForPet(pet.id), now);
  const items = [...holdItems, ...medicationItems]
    .sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime())
    .slice(0, 5);

  // Tidy empty state: render nothing when there is genuinely nothing upcoming.
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      {heading}
      <UpcomingList items={items} now={now} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26 },

  // "Learning Mochi's rhythm" — design v2 `.card.glass` with an accent-soft icon tile.
  learnCard: {
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.card,
    padding: 16,
    ...shadow.card,
  },
  learnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  learnIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  learnIconInline: { marginBottom: 0 },
  learnTitle: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.2, marginBottom: 4 },

  // Horizontal strip of individual upcoming cards.
  strip: { flexGrow: 0, flexShrink: 0, marginHorizontal: -16, marginTop: 2 },
  stripContent: { gap: 8, paddingVertical: 4, paddingHorizontal: 16 },
  card: {
    minWidth: 128,
    maxWidth: 220,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 2,
  },
  cardIcon: { marginBottom: 8 },
  time: { fontSize: 15, fontFamily: fonts.mono, color: ink.primary, letterSpacing: -0.3 },
  timeOverdue: { color: warn.ink },
  cardLabel: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.primary },
  cardSub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted },

  noticePressed: { opacity: 0.8 },
  noticeBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, lineHeight: 19 },
  noticeLink: { marginTop: 12, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  noticeLinkText: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },
});
