import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, green, ink, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { RemindersStrip } from './RemindersStrip';
import { Card } from './ui';
import { Icon } from './Icon';
import type { Pet, Reminder } from '../data/mockData';
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

function toReminder(item: UpcomingItem, now: Date): Reminder {
  return {
    id: item.id,
    type: item.type,
    icon: item.icon,
    label: item.label,
    time: formatTimeRange(item.timeStart, item.timeEnd),
    sub:
      item.kind === 'overdue'
        ? `Overdue ${formatTimeUntilCompact(new Date(now.getTime() + item.overdueBy), now)}`
        : formatTimeUntil(item.timeStart, now),
  };
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
      <View style={{ gap: 10 }}>
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
        {medicationItems.length > 0 && (
          <RemindersStrip reminders={medicationItems.map((item) => toReminder(item, now))} />
        )}
      </View>
    );
  }

  if (status.kind === 'needsInfo') {
    return (
      <View style={{ gap: 10 }}>
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
        {medicationItems.length > 0 && (
          <RemindersStrip reminders={medicationItems.map((item) => toReminder(item, now))} />
        )}
      </View>
    );
  }

  const holdItems = getUpcomingForPet(pet, feedTimes, getLogsForPet(pet.id), now);
  const reminders = [...holdItems, ...medicationItems]
    .sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime())
    .slice(0, 5)
    .map((item) => toReminder(item, now));

  return <RemindersStrip reminders={reminders} />;
}

const styles = StyleSheet.create({
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
