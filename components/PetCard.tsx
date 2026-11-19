import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { Pet } from '../data/mockData';
import {
  countLogsToday,
  formatClock,
  formatTimeRange,
  getPetStatus,
  getTodaysMeals,
  getUpcomingForPet,
} from '../lib/petSchedule';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { accent, glass, ink, radius, shadow, surface, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { PetAvatar } from './PetAvatar';
import { StatGroup, type Stat } from './ui';
import { gentleLate, petMeta } from '../lib/petVoice';

const RING = 112; // outer diameter of the photo ring
const STROKE = 7;

/** "1h 12m" / "45m" / "Now" — a precise countdown for the hero headline. */
function countdown(ms: number): string {
  if (ms <= 0) return 'Now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The pet's photo (or emoji) inside a ring that fills as the next break approaches. */
function PhotoRing({ pet, progress, late }: { pet: Pet; progress: number | null; late: boolean }) {
  const r = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress ?? 0));
  const color = late ? warn.primary : accent.primary;
  return (
    <View style={{ width: RING, height: RING }}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        {/* Rotate via the transform attribute: react-native-svg-web rejects `origin`. */}
        <G transform={`rotate(-90 ${RING / 2} ${RING / 2})`}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={late ? warn.soft : accent.soft} strokeWidth={STROKE} fill="none" />
          {progress != null && (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={color}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - p)}
            />
          )}
        </G>
      </Svg>
      <View style={styles.photoWrap}>
        <PetAvatar pet={pet} size={RING - STROKE * 2 - 10} emojiSize={40} />
      </View>
    </View>
  );
}

/**
 * The hero at the top of Today: the pet's photo in a progress ring beside a countdown to
 * the next potty break, then a hairline and three mono stats.
 *
 * - Upcoming: "Pee break in 1h 12m", with the predicted window underneath.
 * - Due: "Pee break due now".
 * - Late: amber ring and "A little late · due 10:54 AM". A missed prediction stays put and
 *   reads as late; it never rolls forward to a later break.
 * - Learning (first days) / no schedule: the same layout with a plain explanation, no ring fill.
 *
 * All numbers come from the shared schedule helpers (the client copy of the prediction).
 */
export function PetCard({ pet }: { pet: Pet }) {
  const { getLogsForPet } = useLogs();
  const { getFeedTimesForPet } = usePets();
  const now = useNow();
  const petLogs = getLogsForPet(pet.id);
  const feedTimes = getFeedTimesForPet(pet.id);
  const status = getPetStatus(pet, feedTimes);

  const meals = getTodaysMeals(feedTimes, now, petLogs);
  const mealsDone = meals.filter((m) => m.status === 'done').length;
  const mealsStat = meals.length > 0 ? `${mealsDone}/${meals.length}` : '—';
  const tightestHold = Math.min(pet.peeHoldHours ?? Infinity, pet.poopHoldHours ?? Infinity);
  const holdStat = Number.isFinite(tightestHold) ? `${tightestHold}h` : '—';

  let kicker = petMeta(pet, now);
  let headline = pet.name;
  let detail = '';
  let progress: number | null = null;
  let late = false;
  let headlineMono = false;

  if (status.kind === 'calibrating') {
    kicker = `Day ${status.day} of 3`;
    headline = `Getting to know ${pet.name}`;
    detail = "Keep logging and we'll learn the routine.";
  } else if (status.kind === 'needsInfo') {
    headline = `Let's set up ${pet.name}`;
    detail = 'Add meal and potty times to get reminders.';
  } else {
    const next = getUpcomingForPet(pet, feedTimes, petLogs, now).find((u) => u.type !== 'food');
    if (next) {
      const what = next.type === 'poo' ? 'Poo break' : 'Pee break';
      headlineMono = true;
      if (next.kind === 'overdue') {
        late = true;
        progress = 1;
        kicker = what;
        headline = gentleLate(Math.floor(next.overdueBy / 60_000)).replace(/^./, (c) => c.toUpperCase());
        detail = `due ${formatClock(new Date(now.getTime() - next.overdueBy))}`;
        headlineMono = false;
      } else if (next.kind === 'due') {
        progress = 1;
        kicker = what;
        headline = 'Due now';
        detail = formatTimeRange(next.timeStart, next.timeEnd);
        headlineMono = false;
      } else {
        kicker = `${what} in`;
        headline = countdown(next.timeStart.getTime() - now.getTime());
        detail = formatTimeRange(next.timeStart, next.timeEnd);
        // Ring fills as the break approaches: 0 just after a break, 1 when it's due.
        if (Number.isFinite(tightestHold) && tightestHold > 0) {
          const remaining = next.timeStart.getTime() - now.getTime();
          progress = 1 - remaining / (tightestHold * 3_600_000);
        }
      }
    } else {
      detail = Number.isFinite(tightestHold) ? `${petMeta(pet, now)} · ${tightestHold}h hold time` : '';
      kicker = 'No break predicted yet';
    }
  }

  const stats: Stat[] = [
    { value: String(countLogsToday(petLogs, now)), label: 'Logs today' },
    { value: mealsStat, label: 'Meals' },
    { value: holdStat, label: 'Holds up to' },
  ];

  return (
    <View style={styles.hero}>
      <View style={styles.top}>
        <PhotoRing pet={pet} progress={progress} late={late} />
        <View style={styles.text}>
          <Text style={[styles.kicker, late && styles.kickerLate]} numberOfLines={1}>
            {kicker}
          </Text>
          <Text
            style={[headlineMono ? styles.countdown : styles.headline, late && styles.headlineLate]}
            numberOfLines={2}
            role="heading"
          >
            {headline}
          </Text>
          {!!detail && (
            <Text style={[styles.detail, headlineMono || late ? styles.detailMono : null]} numberOfLines={2}>
              {detail}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.statsWrap}>
        <StatGroup stats={stats} variant="onLight" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 6,
    marginBottom: 2,
    borderRadius: radius.hero,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: glass.border,
    ...shadow.hero,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 132 },
  photoWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: fonts.regular, fontSize: 13, color: ink.muted },
  kickerLate: { color: warn.ink },
  countdown: { fontFamily: fonts.mono, fontSize: 36, color: ink.primary, letterSpacing: -1.5, lineHeight: 42, marginTop: 2 },
  headline: { fontFamily: fonts.medium, fontSize: 21, color: ink.primary, letterSpacing: -0.6, lineHeight: 26, marginTop: 4 },
  headlineLate: { color: warn.ink },
  detail: { fontFamily: fonts.regular, fontSize: 13, color: ink.muted, marginTop: 4, lineHeight: 18 },
  detailMono: { fontFamily: fonts.monoRegular, fontSize: 12.5 },
  statsWrap: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: glass.border },
});
