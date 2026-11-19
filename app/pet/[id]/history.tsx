import { useMemo } from 'react';
import { possessive } from '../../../lib/petVoice';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { accent, ink, line, category, radius } from '../../../theme/colors';
import { fonts } from '../../../theme/fonts';
import { Icon, type IconName } from '../../../components/Icon';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { Card, HeroAvatar, Screen } from '../../../components/ui';
import { usePets } from '../../../context/PetsContext';
import { useLogs } from '../../../context/LogsContext';
import { useAppointments } from '../../../context/AppointmentsContext';
import { describeLog, formatClock } from '../../../lib/petSchedule';
import { useNow } from '../../../hooks/useNow';
import type { Appointment, ApptType, FeedTime, LogEntry } from '../../../lib/db/models';
import { presentLogType } from '../../../lib/care/logTypes';
import { REGISTRY } from '../../../lib/care/registry';
import { pottyPhraseForPet } from '../../../lib/care/species';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today" / "Yesterday" / "Mon, Jan 5" for a day bucket, relative to `now`. */
function dayLabel(dayMs: number, now: Date): string {
  const today = startOfDay(now.getTime());
  if (dayMs === today) return 'Today';
  if (dayMs === today - DAY_MS) return 'Yesterday';
  const d = new Date(dayMs);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

type Visual = { icon: IconName; bg: string; fg: string };

const APPT_VISUAL: Record<ApptType, Visual & { label: string }> = {
  vet: { icon: 'vet', bg: category.vetBg, fg: category.vetInk, label: 'Vet' },
  vaccine: { icon: 'vaccine', bg: category.vaccineBg, fg: category.vaccineInk, label: 'Vaccine' },
  groom: { icon: 'scissors', bg: category.groomBg, fg: category.groomInk, label: 'Grooming' },
  other: { icon: 'calendar', bg: category.otherBg, fg: category.otherInk, label: 'Visit' },
};

/** One diary line — a log or a visit that has happened. */
type Moment = {
  id: string;
  at: number;
  label: string;
  note: string | null;
  visual: Visual;
  /** For the day summary: meals, potty walks, everything else. */
  bucket: 'meal' | 'potty' | 'other';
  /** All-day visits show "All day" instead of a clock time. */
  allDay?: boolean;
};

/**
 * The day-summary bucket for a log type, by the care module that owns it: meals logs are
 * "meal", potty logs are "potty", everything else (meds, vet, other, unknown) is "other".
 */
function bucketOf(type: string): Moment['bucket'] {
  const owner = REGISTRY.find((m) => (m.logTypes as readonly string[]).includes(type))?.id;
  return owner === 'meals' ? 'meal' : owner === 'potty' ? 'potty' : 'other';
}

function toMoments(logs: LogEntry[], appts: Appointment[], feedTimes: FeedTime[], now: Date): Moment[] {
  const fromLogs: Moment[] = logs
    .filter((l) => !l.deletedAt)
    .map((l) => ({
      id: `log-${l.id}`,
      at: new Date(l.occurredAt).getTime(),
      label: l.type === 'food' ? 'Meal' : describeLog(l, feedTimes, now).label,
      note: l.note ?? null,
      visual: presentLogType(l.type),
      bucket: bucketOf(l.type),
    }));
  // Visits join the diary once they've happened (or were marked done).
  const fromAppts: Moment[] = appts
    .filter((a) => !a.deletedAt && (a.completedAt != null || new Date(a.startsAt).getTime() <= now.getTime()))
    .map((a) => {
      const v = APPT_VISUAL[a.type] ?? APPT_VISUAL.other;
      return {
        id: `appt-${a.id}`,
        at: new Date(a.startsAt).getTime(),
        label: v.label,
        note: a.title || null,
        visual: v,
        bucket: 'other' as const,
        allDay: a.allDay,
      };
    });
  return [...fromLogs, ...fromAppts].sort((a, b) => b.at - a.at);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 potty walks · 1 meal · 1 more" — "litter box trips" for cats and rabbits. */
function daySummary(moments: Moment[], potty1: string): string {
  const meals = moments.filter((m) => m.bucket === 'meal').length;
  const potty = moments.filter((m) => m.bucket === 'potty').length;
  const other = moments.length - meals - potty;
  return [
    potty > 0 ? plural(potty, potty1, `${potty1}s`) : null,
    meals > 0 ? plural(meals, 'meal', 'meals') : null,
    other > 0 ? `${other} more` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * "Mochi's diary" (design v2): everything that happened to the pet — pee/poo/meal/med logs
 * plus vet visits — newest first. Each day gets a plain heading with a mono one-line summary,
 * and that day's entries sit in one glass list card (icon tile · title · note · mono time).
 */
export default function LogHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, getFeedTimesForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const { appointments } = useAppointments();
  const now = useNow();

  const pet = pets.find((p) => p.id === id) ?? null;
  const feedTimes = pet ? getFeedTimesForPet(pet.id) : [];
  const logs = pet ? getLogsForPet(pet.id) : [];
  const petAppts = pet ? appointments.filter((a) => a.petIds.includes(pet.id)) : [];

  const moments = useMemo(() => toMoments(logs, petAppts, feedTimes, now), [logs, petAppts, feedTimes, now]);
  const groups = useMemo(() => {
    const byDay = new Map<number, Moment[]>();
    for (const m of moments) {
      const day = startOfDay(m.at);
      const list = byDay.get(day);
      if (list) list.push(m);
      else byDay.set(day, [m]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([dayMs, entries]) => ({ dayMs, label: dayLabel(dayMs, now), entries }));
  }, [moments, now]);

  const subtitle =
    moments.length === 0
      ? 'Nothing logged yet'
      : `${plural(moments.length, 'moment', 'moments')} over ${plural(groups.length, 'day', 'days')}`;

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        title={pet ? `${possessive(pet.name)} diary` : 'Diary'}
        subtitle={subtitle}
        fallback="/(tabs)/pets"
        right={pet ? <HeroAvatar pet={pet} size={38} /> : <View />}
      />

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="clock" size={24} color={accent.ink} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>No moments yet</Text>
          <Text style={styles.emptyBody}>Potty breaks, meals, meds and vet visits will appear here, grouped by day.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {groups.map((group) => (
            <View key={group.dayMs} style={styles.group}>
              <View style={styles.dayHead}>
                <Text style={styles.dayHeader} role="heading">
                  {group.label}
                </Text>
                <Text style={styles.daySummary} numberOfLines={1}>
                  {daySummary(group.entries, pottyPhraseForPet(pet))}
                </Text>
              </View>
              <Card>
                {group.entries.map((m, i) => (
                  <View key={m.id}>
                    <View style={styles.row}>
                      <View style={[styles.tile, { backgroundColor: m.visual.bg }]}>
                        <Icon name={m.visual.icon} size={16} color={m.visual.fg} strokeWidth={1.8} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel} numberOfLines={1}>
                          {m.label}
                        </Text>
                        {!!m.note && (
                          <Text style={styles.rowNote} numberOfLines={2}>
                            {m.note}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.rowTime}>{m.allDay ? 'All day' : formatClock(new Date(m.at))}</Text>
                    </View>
                    {i < group.entries.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 },
  group: { marginBottom: 14 },
  dayHead: { gap: 2, paddingHorizontal: 4, paddingTop: 8, marginBottom: 8 },
  dayHeader: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.15 },
  daySummary: { fontSize: 11, fontFamily: fonts.monoRegular, color: ink.muted },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 10, paddingHorizontal: 14 },
  tile: { width: 34, height: 34, borderRadius: radius.iconTile, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  rowNote: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  rowTime: { fontSize: 12, fontFamily: fonts.monoRegular, color: ink.muted, flexShrink: 0 },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 14 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.35 },
  emptyBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center', lineHeight: 19 },
});
