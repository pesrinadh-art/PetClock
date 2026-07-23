import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { RemindersStrip } from './RemindersStrip';
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
  const status = getPetStatus(pet);
  const now = new Date();

  // Medications are user-specified fixed times, not something we're learning — so they
  // show up regardless of whether the pee/poop calibration below is done.
  const medicationItems = getUpcomingMedications(pet, now);

  if (status.kind === 'calibrating') {
    return (
      <View style={{ gap: 10 }}>
        <View style={[styles.notice, { borderColor: colors.pee, backgroundColor: '#FFF8DB' }]}>
          <Text style={styles.noticeIcon}>🔄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Calibrating {pet.name}'s schedule</Text>
            <Text style={styles.noticeBody}>
              Day {status.day} of 3 — log a few pees, poos, and meals and we'll start predicting {pet.name}'s next break.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.noticeLink, pressed && styles.noticePressed]}
              onPress={() => router.push({ pathname: '/add-pet', params: { petId: pet.id } })}
              hitSlop={4}
            >
              <Text style={styles.noticeLinkText}>📝 Add schedule now instead ›</Text>
            </Pressable>
          </View>
        </View>
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
          style={({ pressed }) => [
            styles.notice,
            { borderColor: colors.sage, backgroundColor: colors.sagePale },
            pressed && styles.noticePressed,
          ]}
          onPress={() => router.push({ pathname: '/add-pet', params: { petId: pet.id } })}
        >
          <Text style={styles.noticeIcon}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Set up {pet.name}'s schedule</Text>
            <Text style={styles.noticeBody}>
              We still don't have feeding & potty info. Fill it in to get real upcoming reminders.
            </Text>
          </View>
          <Text style={styles.noticeChevron}>›</Text>
        </Pressable>
        {medicationItems.length > 0 && (
          <RemindersStrip reminders={medicationItems.map((item) => toReminder(item, now))} />
        )}
      </View>
    );
  }

  const holdItems = getUpcomingForPet(pet, getLogsForPet(pet.id), now);
  const reminders = [...holdItems, ...medicationItems]
    .sort((a, b) => a.timeStart.getTime() - b.timeStart.getTime())
    .slice(0, 5)
    .map((item) => toReminder(item, now));

  return <RemindersStrip reminders={reminders} />;
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    padding: 14,
    ...shadow.sm,
  },
  noticePressed: { opacity: 0.8 },
  noticeIcon: { fontSize: 20 },
  noticeTitle: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 3 },
  noticeBody: { fontSize: 12, color: colors.stoneMid, lineHeight: 17 },
  noticeLink: { marginTop: 8, alignSelf: 'flex-start' },
  noticeLinkText: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.sage },
  noticeChevron: { fontSize: 20, color: colors.sage, fontFamily: fonts.bold, alignSelf: 'center' },
});
