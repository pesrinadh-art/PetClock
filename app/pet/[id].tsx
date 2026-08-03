import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { SectionTitle } from '../../components/SectionTitle';
import { PetAvatar } from '../../components/PetAvatar';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { getPetStatus } from '../../lib/petSchedule';
import { computeStreak } from '../../lib/streaks';
import { useNow } from '../../hooks/useNow';
import type { LogEntry } from '../../lib/db/models';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Streak = the shared "everything fed" daily streak (lib/streaks.ts), so Pet Detail
// matches the 🔥 pill on PetCard exactly.

function calibrationInsight(status: ReturnType<typeof getPetStatus>): { icon: string; title: string; body: string } {
  switch (status.kind) {
    case 'ready':
      return {
        icon: '✅',
        title: 'Predictions ready',
        body: "We've learned this pet's rhythm — potty breaks and meals are being predicted.",
      };
    case 'calibrating':
      return {
        icon: '📊',
        title: `Calibrating · day ${status.day} of 3`,
        body: 'Log a few pees, poos and meals and we’ll start predicting break times.',
      };
    case 'needsInfo':
      return {
        icon: '✏️',
        title: 'Needs a schedule',
        body: 'Add feed times and hold hours (or keep logging) so we can predict breaks.',
      };
  }
}

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, getFeedTimesForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();

  const pet = pets.find((p) => p.id === id) ?? null;
  const feedTimes = pet ? getFeedTimesForPet(pet.id) : [];
  const logs = pet ? getLogsForPet(pet.id) : [];

  const streak = useMemo(() => computeStreak(feedTimes, logs, now), [feedTimes, logs, now]);
  const status = pet ? getPetStatus(pet, feedTimes, now) : null;
  const insight = status ? calibrationInsight(status) : null;
  const activeLogs = logs.filter((l) => !l.deletedAt);

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Pet" />
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🐾</Text>
          <Text style={styles.emptyTitle}>Pet not found</Text>
          <Text style={styles.emptyBody}>This pet may have been removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header title={pet.name} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <PetAvatar pet={pet} size={88} emojiSize={40} style={styles.avatar} />
          <Text style={styles.name}>{pet.name}</Text>
          <Text style={styles.sub}>{pet.breed || 'No details yet'}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>🔥 {streak}</Text>
            <Text style={styles.statLabel}>Day streak</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{activeLogs.length}</Text>
            <Text style={styles.statLabel}>Total logs</Text>
          </View>
        </View>

        {insight ? (
          <>
            <SectionTitle>Calibration</SectionTitle>
            <View style={styles.insightCard}>
              <Text style={styles.insightIcon}>{insight.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          </>
        ) : null}

        <SectionTitle>More</SectionTitle>
        <LinkRow
          icon="🗂️"
          label="Log history"
          onPress={() => router.push({ pathname: '/pet/[id]/history', params: { id: pet.id } })}
        />
        <LinkRow
          icon="✏️"
          label="Edit pet"
          onPress={() => router.push({ pathname: '/add-pet', params: { petId: pet.id } })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.titleRow}>
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pets'))}
        role="button"
        aria-label="Back"
        hitSlop={8}
      >
        <Text style={styles.backBtnText}>‹</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={{ width: 32 }} />
    </View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
      onPress={onPress}
      role="button"
      aria-label={label}
    >
      <Text style={styles.linkIcon}>{icon}</Text>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.linkChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 8,
  },
  title: { fontSize: 20, fontFamily: fonts.black, color: colors.stone, textAlign: 'center', flex: 1 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 22, fontFamily: fonts.extraBold, color: colors.stoneMid, marginTop: -2 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  headerCard: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  avatar: {
    backgroundColor: colors.sagePale,
    marginBottom: 4,
  },
  name: { fontSize: 22, fontFamily: fonts.black, color: colors.stone },
  sub: { fontSize: 13, color: colors.stoneMid },

  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    ...shadow.sm,
  },
  statValue: { fontSize: 20, fontFamily: fonts.black, color: colors.stone },
  statLabel: { fontSize: 11, fontFamily: fonts.bold, color: colors.stoneMid, textTransform: 'uppercase', letterSpacing: 0.5 },

  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.sagePale,
    borderWidth: 1.5,
    borderColor: colors.sageLight,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
  },
  insightIcon: { fontSize: 22 },
  insightTitle: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 3 },
  insightBody: { fontSize: 12, color: colors.stoneMid, lineHeight: 17 },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 16,
    marginBottom: 8,
    ...shadow.sm,
  },
  linkRowPressed: { opacity: 0.7 },
  linkIcon: { fontSize: 18 },
  linkLabel: { flex: 1, fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  linkChevron: { fontSize: 20, fontFamily: fonts.extraBold, color: colors.stoneLight },

  // No negative marginTop: on web it would pull this full-height view up over the header row and
  // swallow taps on the back button — the same failure the notifications empty state had.
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone },
  emptyBody: { fontSize: 13, color: colors.stoneMid, textAlign: 'center', lineHeight: 19 },
});
