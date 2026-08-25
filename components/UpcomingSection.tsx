import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, category, green, ink, logTint, radius, shadow, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Card, SectionLabel } from './ui';
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

/** Drawn-icon + tint per upcoming-item type (mirrors Timeline's TYPE_STYLE). */
const ITEM_STYLE: Record<UpcomingItem['type'], { icon: IconName; bg: string; fg: string }> = {
  pee: { icon: 'drop', bg: logTint.peeBg, fg: logTint.peeInk },
  poo: { icon: 'poo', bg: logTint.pooBg, fg: logTint.pooInk },
  food: { icon: 'bowl', bg: terracotta.tint, fg: terracotta.primary },
  medication: { icon: 'pill', bg: category.medBg, fg: category.medInk },
};

/**
 * One upcoming reminder as its own card: tinted drawn-icon tile, label, time
 * range, and a relative "when" / "overdue" sub. Overdue items pick up a
 * terracotta accent bar + terracotta time/sub text. (Restores the pre-redesign
 * per-item card look, restyled in the new design system.)
 */
function UpcomingCard({ item, now }: { item: UpcomingItem; now: Date }) {
  const s = ITEM_STYLE[item.type];
  const overdue = item.kind === 'overdue';
  const sub = overdue
    ? `Overdue ${formatTimeUntilCompact(new Date(now.getTime() + item.overdueBy), now)}`
    : formatTimeUntil(item.timeStart, now);
  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <View style={[styles.typeTile, { backgroundColor: overdue ? terracotta.tint : s.bg }]}>
        <Icon name={s.icon} size={16} color={overdue ? terracotta.primary : s.fg} strokeWidth={2} />
      </View>
      <Text numberOfLines={1} style={styles.cardLabel}>
        {item.label}
      </Text>
      <Text numberOfLines={1} style={[styles.time, overdue && styles.timeOverdue]}>
        {formatTimeRange(item.timeStart, item.timeEnd)}
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

  if (status.kind === 'calibrating') {
    return (
      <View style={styles.sectionStack}>
        <Card padded style={styles.notice}>
          <View style={[styles.iconTile, { backgroundColor: amber.warnBg }]}>
            <Icon name="clock" size={16} color={amber.warnInk} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Calibrating {pet.name}'s schedule</Text>
            <Text style={styles.noticeBody}>
              Day {status.day} of 3 — log a few pees, poos, and meals and we'll start predicting {pet.name}'s next break.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.noticeLink, pressed && styles.noticePressed]}
              onPress={() => router.push({ pathname: '/add-pet', params: { petId: pet.id } })}
              role="button"
              aria-label={`Add ${pet.name}'s schedule now`}
              hitSlop={4}
            >
              <Text style={styles.noticeLinkText}>Add schedule now instead ›</Text>
            </Pressable>
          </View>
        </Card>
        <UpcomingList items={medicationItems} now={now} />
      </View>
    );
  }

  if (status.kind === 'needsInfo') {
    return (
      <View style={styles.sectionStack}>
        <Pressable
          onPress={() => router.push({ pathname: '/add-pet', params: { petId: pet.id } })}
          role="button"
          aria-label={`Set up ${pet.name}'s schedule`}
        >
          {({ pressed }) => (
            <Card padded style={[styles.notice, pressed && styles.noticePressed]}>
              <View style={[styles.iconTile, { backgroundColor: green.tint }]}>
                <Icon name="calendar" size={16} color={green.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>Set up {pet.name}'s schedule</Text>
                <Text style={styles.noticeBody}>
                  We still don't have feeding & potty info. Fill it in to get real upcoming reminders.
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={green.primary} strokeWidth={2.2} />
            </Card>
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
      <SectionLabel>Upcoming</SectionLabel>
      <UpcomingList items={items} now={now} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionStack: { marginTop: 18, gap: 10 },

  // Horizontal strip of individual upcoming cards.
  strip: { flexGrow: 0, flexShrink: 0, marginHorizontal: -2 },
  stripContent: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  card: {
    minWidth: 150,
    maxWidth: 220,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    ...shadow.card,
  },
  cardOverdue: { borderTopColor: terracotta.primary },
  typeTile: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardLabel: { fontSize: 13.5, fontFamily: fonts.bold, color: ink.primary, marginBottom: 3 },
  cardSub: { fontSize: 11.5, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },

  time: { fontSize: 13, fontFamily: fonts.extraBold, color: ink.primary },
  timeOverdue: { color: terracotta.primary },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticePressed: { opacity: 0.8 },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noticeTitle: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary, marginBottom: 3 },
  noticeBody: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, lineHeight: 17 },
  noticeLink: { marginTop: 8, alignSelf: 'flex-start' },
  noticeLinkText: { fontSize: 12, fontFamily: fonts.bold, color: green.primary },
});
