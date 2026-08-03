import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { countLogsToday, formatTimeUntilCompact, getPetStatus, getUpcomingForPet } from '../lib/petSchedule';
import { computeStreak } from '../lib/streaks';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { PetAvatar } from './PetAvatar';

export function PetCard({ pet }: { pet: Pet }) {
  const { getLogsForPet } = useLogs();
  const { getFeedTimesForPet } = usePets();
  const petLogs = getLogsForPet(pet.id);
  const feedTimes = getFeedTimesForPet(pet.id);
  const status = getPetStatus(pet, feedTimes);
  const now = new Date();
  // 🔥 run of consecutive days every meal was logged (see lib/streaks).
  const streak = computeStreak(feedTimes, petLogs, now);

  // birthdate/age is a post-SYNC-1 picker; show breed only (or "—") where meta was.
  const meta = pet.breed || '—';
  let metaSuffix = '';
  let holdTimeDisplay = '—';
  let nextBreakDisplay = '—';

  if (status.kind === 'calibrating') {
    metaSuffix = ` · Day ${status.day} of calibration`;
  } else if (status.kind === 'needsInfo') {
    metaSuffix = ' · Needs setup';
  } else {
    const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
    holdTimeDisplay = `${tightestHold}h`;
    const nextPottyBreak = getUpcomingForPet(pet, feedTimes, petLogs, now).find((u) => u.type !== 'food');
    if (nextPottyBreak) nextBreakDisplay = formatTimeUntilCompact(nextPottyBreak.timeStart, now);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.pawWatermark}>🐾</Text>
      <View style={styles.top}>
        <PetAvatar pet={pet} size={52} emojiSize={26} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{pet.name}</Text>
          <Text style={styles.meta}>{meta}{metaSuffix}</Text>
        </View>
        {streak > 0 ? (
          <View style={styles.streakPill} aria-label={`${streak} day feeding streak`}>
            <Text style={styles.streakText}>🔥 {streak}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.stats}>
        <Stat value={holdTimeDisplay} label="Hold Time" />
        <Stat value={String(countLogsToday(petLogs, now))} label="Logs Today" />
        <Stat value={nextBreakDisplay} label="Next Break" />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.sage,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  pawWatermark: {
    position: 'absolute',
    right: 16,
    top: 12,
    fontSize: 44,
    opacity: 0.15,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  streakPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  streakText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
  name: { fontSize: 19, fontFamily: fonts.extraBold, color: colors.white },
  meta: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statVal: { fontSize: 17, fontFamily: fonts.extraBold, color: colors.white },
  statLbl: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
