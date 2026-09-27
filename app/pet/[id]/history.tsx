import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ink, line, radius, shadow, space, surface } from '../../../theme/colors';
import { fonts, type } from '../../../theme/fonts';
import { IconTile, PetEmptyState, Screen, ScreenHeader } from '../../../components/ui';
import { PetAvatar } from '../../../components/PetAvatar';
import { logVisual } from '../../../components/pets/logVisual';
import { usePets } from '../../../context/PetsContext';
import { useLogs } from '../../../context/LogsContext';
import { describeLog, formatClock } from '../../../lib/petSchedule';
import { useNow } from '../../../hooks/useNow';
import { possessive, pottyBreakPhrase } from '../../../lib/petVoice';
import type { FeedTime, LogEntry } from '../../../lib/db/models';

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today" / "Yesterday" / "Mon, Jan 5" for a day bucket, relative to `now`. */
function dayLabel(dayMs: number, now: Date): string {
  const today = startOfDay(now.getTime());
  if (dayMs === today) return 'Today';
  if (dayMs === today - 24 * 60 * 60 * 1000) return 'Yesterday';
  const d = new Date(dayMs);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

type DayGroup = { dayMs: number; label: string; entries: LogEntry[] };

function groupByDay(logs: LogEntry[], feedTimes: FeedTime[], now: Date): DayGroup[] {
  const byDay = new Map<number, LogEntry[]>();
  for (const l of logs) {
    if (l.deletedAt) continue;
    const day = startOfDay(new Date(l.occurredAt).getTime());
    const list = byDay.get(day);
    if (list) list.push(l);
    else byDay.set(day, [l]);
  }
  // logs arrive newest-first; keep days descending and entries newest-first within a day.
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayMs, entries]) => ({ dayMs, label: dayLabel(dayMs, now), entries }));
}

/** A short, warm summary of one day's entries: "2 meals · 3 potty walks". */
function daySummary(entries: LogEntry[], species: string | null | undefined): string {
  let meals = 0;
  let potty = 0;
  let meds = 0;
  let other = 0;
  for (const e of entries) {
    if (e.type === 'food') meals += 1;
    else if (e.type === 'pee' || e.type === 'poo') potty += 1;
    else if (e.type === 'medication') meds += 1;
    else other += 1;
  }
  const parts: string[] = [];
  const phrase = pottyBreakPhrase(species);
  if (meals) parts.push(`${meals} ${meals === 1 ? 'meal' : 'meals'}`);
  if (potty) parts.push(`${potty} ${potty === 1 ? phrase : `${phrase}s`}`);
  if (meds) parts.push(`${meds} ${meds === 1 ? 'med' : 'meds'}`);
  if (other) parts.push(`${other} more`);
  return parts.join(' · ');
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pets'));

export default function LogHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pets, getFeedTimesForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const now = useNow();

  const pet = pets.find((p) => p.id === id) ?? null;
  const feedTimes = pet ? getFeedTimesForPet(pet.id) : [];
  const logs = pet ? getLogsForPet(pet.id) : [];

  const groups = useMemo(() => groupByDay(logs, feedTimes, now), [logs, feedTimes, now]);
  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  const header = (
    <ScreenHeader
      title={pet ? `${possessive(pet.name)} diary` : 'Diary'}
      subtitle={
        groups.length > 0
          ? `${total} ${total === 1 ? 'moment' : 'moments'} over ${groups.length} ${groups.length === 1 ? 'day' : 'days'}`
          : undefined
      }
      onBack={goBack}
      backLabel="Back"
      right={pet ? <PetAvatar pet={pet} size={40} ring /> : undefined}
    />
  );

  if (groups.length === 0) {
    return (
      <Screen header={header} scroll={false}>
        <PetEmptyState
          pet={pet}
          icon="history"
          title={pet ? `${possessive(pet.name)} diary is empty` : 'No logs yet'}
          body={`Log a ${pottyBreakPhrase(pet?.species)}, a meal or a med and it'll show up here, day by day.`}
          action={{ label: pet ? `Back to ${pet.name}` : 'Go back', icon: 'chevronLeft', onPress: goBack }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      {groups.map((group) => (
        <View key={group.dayMs} style={styles.group}>
          <View style={styles.dayHead}>
            <Text style={styles.dayLabel} role="heading">
              {group.label}
            </Text>
            <Text style={styles.daySummary} numberOfLines={1}>
              {daySummary(group.entries, pet?.species)}
            </Text>
          </View>

          <View style={styles.dayCard}>
            {group.entries.map((entry, i) => {
              const { label } = describeLog(entry, feedTimes, now);
              const v = logVisual(entry.type);
              const time = formatClock(new Date(entry.occurredAt));
              const last = i === group.entries.length - 1;
              return (
                <View
                  key={entry.id}
                  style={styles.row}
                  aria-label={`${label} at ${time}${entry.note ? `. Note: ${entry.note}` : ''}`}
                >
                  {/* Rail: the icon sits on a thin line that threads the day together. */}
                  <View style={styles.rail}>
                    <IconTile icon={v.icon} tone={v.tone} size={40} />
                    {!last && <View style={styles.railLine} />}
                  </View>
                  <View style={[styles.rowBody, !last && styles.rowBodyGap]}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowLabel} numberOfLines={2}>
                        {label}
                      </Text>
                      <Text style={styles.rowTime}>{time}</Text>
                    </View>
                    {!!entry.note && (
                      <View style={styles.note}>
                        <Text style={styles.noteText}>{entry.note}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.lg },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginBottom: space.sm },
  dayLabel: { ...type.heading, color: ink.primary },
  daySummary: { ...type.caption, color: ink.muted, flexShrink: 1, textAlign: 'right' },

  dayCard: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    ...shadow.card,
  },
  row: { flexDirection: 'row', gap: space.sm, minHeight: 48 },
  rail: { width: 40, alignItems: 'center' },
  railLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: line.border, marginVertical: 4, minHeight: 12 },
  rowBody: { flex: 1, minWidth: 0, paddingTop: 9 },
  rowBodyGap: { paddingBottom: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  rowLabel: { ...type.subhead, color: ink.primary, flex: 1 },
  rowTime: { ...type.caption, fontFamily: fonts.bold, color: ink.muted, marginTop: 2 },
  note: {
    marginTop: 6,
    backgroundColor: surface.field,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
  },
  noteText: { ...type.bodySm, color: ink.primary },
});
