import { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { LogEntry, Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { repos } from '../lib/repo/types';
import { formatClock } from '../lib/petSchedule';
import { AppModal } from './AppModal';
import { useSnackbar } from './Snackbar';

/** Which break a tap/long-press targets. 'both' writes a pee AND a poo at once. */
type LogTarget = 'pee' | 'poo' | 'both';

type LogButtonSpec = {
  key: LogTarget;
  emoji: string;
  label: string;
  sub: string;
  bg: string;
  border: string;
};

/** Backdate presets offered by the long-press chooser (minutes before now). */
const PRESETS: { label: string; minutesAgo: number }[] = [
  { label: 'Now', minutesAgo: 0 },
  { label: '15 min ago', minutesAgo: 15 },
  { label: '30 min ago', minutesAgo: 30 },
  { label: '1 hour ago', minutesAgo: 60 },
];

const MINUTE_MS = 60 * 1000;

function mostRecentLog(logs: LogEntry[], type: 'pee' | 'poo') {
  const matches = logs.filter((l) => l.type === type && !l.deletedAt);
  if (matches.length === 0) return null;
  return matches.reduce((latest, l) =>
    new Date(l.occurredAt).getTime() > new Date(latest.occurredAt).getTime() ? l : latest,
  );
}

/** Half-hour clock slots for the "Custom" backdate picker (12:00 AM … 11:30 PM). */
function generateTimeSlots(): { label: string; hours: number; minutes: number }[] {
  const slots: { label: string; hours: number; minutes: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const period = h < 12 ? 'AM' : 'PM';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      slots.push({ label: `${hour12}:${m.toString().padStart(2, '0')} ${period}`, hours: h, minutes: m });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();
const SLOT_HEIGHT = 46;

function targetLabel(target: LogTarget): string {
  if (target === 'pee') return 'Pee';
  if (target === 'poo') return 'Poo';
  return 'Pee + poo';
}

/** Fire-and-forget success haptic; no-op on web and never throws. */
function successHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function LogButtons({ pet }: { pet: Pet }) {
  const { getLogsForPet, removeLog } = useLogs();
  const { show } = useSnackbar();
  const logs = getLogsForPet(pet.id);

  // Long-press "when?" chooser and its deeper "Custom" time picker.
  const [chooser, setChooser] = useState<LogTarget | null>(null);
  const [customFor, setCustomFor] = useState<LogTarget | null>(null);

  const lastPee = mostRecentLog(logs, 'pee');
  const lastPoo = mostRecentLog(logs, 'poo');

  const buttons: LogButtonSpec[] = [
    {
      key: 'pee',
      emoji: '💧',
      label: 'Pee',
      sub: lastPee ? `Last ${formatClock(new Date(lastPee.occurredAt))}` : 'No logs yet',
      bg: '#FFF8DB',
      border: colors.pee,
    },
    {
      key: 'poo',
      emoji: '💩',
      label: 'Poo',
      sub: lastPoo ? `Last ${formatClock(new Date(lastPoo.occurredAt))}` : 'No logs yet',
      bg: '#FBF0EA',
      border: colors.pooLight,
    },
    {
      key: 'both',
      emoji: '💧💩',
      label: 'Both',
      sub: 'Pee + poo',
      bg: colors.sagePale,
      border: colors.sageLight,
    },
  ];

  // Writes the log(s) for `target`, shows a single Undo snackbar reverting ALL of them, and
  // buzzes on success. `occurredAt` backdates the entry; omitted = now.
  const commit = async (target: LogTarget, occurredAt?: string) => {
    const ids: string[] = [];
    if (target === 'both') {
      const at = occurredAt ?? new Date().toISOString();
      // Same instant for both so they read as one bathroom trip.
      const pee = await repos.logs.add(pet.id, { type: 'pee', occurredAt: at });
      const poo = await repos.logs.add(pet.id, { type: 'poo', occurredAt: at });
      ids.push(pee.id, poo.id);
    } else {
      const entry = await repos.logs.add(pet.id, { type: target, occurredAt });
      ids.push(entry.id);
    }
    successHaptic();
    // One Undo removes every log this action wrote (both, for the "Both" button).
    show(`${targetLabel(target)} logged for ${pet.name}`, () => ids.forEach((id) => removeLog(id)));
  };

  const handlePreset = (minutesAgo: number) => {
    const target = chooser;
    if (!target) return;
    const occurredAt =
      minutesAgo === 0 ? undefined : new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString();
    setChooser(null);
    void commit(target, occurredAt);
  };

  const openCustom = () => {
    setCustomFor(chooser);
    setChooser(null);
  };

  const handleCustom = (hours: number, minutes: number) => {
    const target = customFor;
    setCustomFor(null);
    if (!target) return;
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    // A time later than now must belong to yesterday — a backdate is always in the past.
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
    void commit(target, d.toISOString());
  };

  return (
    <View>
      <View style={styles.row}>
        {buttons.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => void commit(b.key)}
            onLongPress={() => setChooser(b.key)}
            delayLongPress={300}
            role="button"
            aria-label={`Log ${targetLabel(b.key).toLowerCase()} for ${pet.name}. ${b.sub}. Long press to backdate.`}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: b.bg, borderColor: b.border },
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.emoji}>{b.emoji}</Text>
            <Text style={styles.label}>{b.label}</Text>
            <Text style={styles.sub}>{b.sub}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Tip: long-press a button to backdate.</Text>

      {/* Long-press "when?" chooser. */}
      <AppModal
        visible={chooser !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setChooser(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setChooser(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {chooser ? `Log ${targetLabel(chooser).toLowerCase()} — when?` : ''}
            </Text>
            {PRESETS.map((p) => (
              <Pressable
                key={p.label}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                onPress={() => handlePreset(p.minutesAgo)}
                role="button"
                aria-label={p.label}
              >
                <Text style={styles.optionText}>{p.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              onPress={openCustom}
              role="button"
              aria-label="Custom time"
            >
              <Text style={styles.optionText}>Custom time…</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* "Custom" time picker (half-hour slots, today; a future time rolls to yesterday). */}
      <AppModal
        visible={customFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomFor(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setCustomFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Pick a time</Text>
            <FlatList
              data={TIME_SLOTS}
              keyExtractor={(t) => t.label}
              style={{ maxHeight: 320 }}
              getItemLayout={(_, index) => ({ length: SLOT_HEIGHT, offset: SLOT_HEIGHT * index, index })}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  onPress={() => handleCustom(item.hours, item.minutes)}
                  role="button"
                  aria-label={item.label}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  btnPressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  emoji: { fontSize: 28 },
  label: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stone },
  sub: { fontSize: 10, color: colors.stoneMid, textAlign: 'center' },
  hint: { fontSize: 11, color: colors.stoneMid, textAlign: 'center', marginTop: 8, marginBottom: 20 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '80%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    ...shadow.card,
  },
  sheetTitle: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 10, textAlign: 'center' },
  option: {
    height: SLOT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  optionText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.stone },
  pressed: { opacity: 0.6, backgroundColor: colors.sagePale },
});
