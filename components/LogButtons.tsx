import { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ink, line, logTint, radius, shadow, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { repos } from '../lib/repo/types';
import { AppModal } from './AppModal';
import { Icon, type IconName } from './Icon';
import { useSnackbar } from './Snackbar';

/** Which quick-log a tap/long-press targets. 'both' writes a pee AND a poo; 'fed' writes a meal. */
type LogTarget = 'pee' | 'poo' | 'both' | 'fed';

type LogButtonSpec = {
  key: LogTarget;
  icon: IconName;
  label: string;
  bg: string;
  fg: string;
};

/** Backdate presets offered by the long-press chooser (minutes before now). */
const PRESETS: { label: string; minutesAgo: number }[] = [
  { label: 'Now', minutesAgo: 0 },
  { label: '15 min ago', minutesAgo: 15 },
  { label: '30 min ago', minutesAgo: 30 },
  { label: '1 hour ago', minutesAgo: 60 },
];

const MINUTE_MS = 60 * 1000;

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
  if (target === 'fed') return 'Meal';
  return 'Pee + poo';
}

/** Fire-and-forget success haptic; no-op on web and never throws. */
function successHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

const BUTTONS: LogButtonSpec[] = [
  { key: 'pee', icon: 'drop', label: 'Pee', bg: logTint.peeBg, fg: logTint.peeInk },
  { key: 'poo', icon: 'poo', label: 'Poo', bg: logTint.pooBg, fg: logTint.pooInk },
  // "Both" = pee + poo. Neutral chip tile carrying BOTH type icons (drop + poo)
  // so it reads as "pee + poo", not a green "done" confirmation. `icon`/`fg` are
  // placeholders; the render special-cases `key === 'both'` (see below).
  { key: 'both', icon: 'drop', label: 'Both', bg: surface.chip, fg: ink.primary },
  { key: 'fed', icon: 'bowl', label: 'Fed', bg: terracotta.tint, fg: terracotta.primary },
];

/**
 * The quick-log tile row (screen 2a): Pee / Poo / Both / Fed, each a tinted tile
 * with a drawn <Icon> and label. Tapping writes the log(s) immediately with a
 * single Undo; long-pressing opens the "when?" backdate chooser. "Both" writes a
 * pee and a poo at the same instant; "Fed" writes a generic meal log. All writes
 * go through the same `repos.logs.add` path as before.
 */
export function LogButtons({ pet }: { pet: Pet }) {
  const { removeLog } = useLogs();
  const { show } = useSnackbar();

  // Long-press "when?" chooser and its deeper "Custom" time picker.
  const [chooser, setChooser] = useState<LogTarget | null>(null);
  const [customFor, setCustomFor] = useState<LogTarget | null>(null);

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
    } else if (target === 'fed') {
      // Generic meal log (no feed-slot); the due-meal prompt stays with MealTimeBanner.
      const entry = await repos.logs.add(pet.id, { type: 'food', feedTimeId: null, occurredAt });
      ids.push(entry.id);
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
    <View style={styles.row}>
      {BUTTONS.map((b) => (
        <Pressable
          key={b.key}
          onPress={() => void commit(b.key)}
          onLongPress={() => setChooser(b.key)}
          delayLongPress={300}
          role="button"
          aria-label={`Log ${targetLabel(b.key).toLowerCase()} for ${pet.name}. Long press to backdate.`}
          style={({ pressed }) => [styles.tile, { backgroundColor: b.bg }, pressed && styles.tilePressed]}
        >
          {b.key === 'both' ? (
            // Two icons so "Both" literally reads as pee + poo: drop in pee-blue,
            // poo in poo-brown, on the neutral chip tile.
            <View style={styles.bothIcons}>
              <Icon name="drop" size={17} color={logTint.peeInk} strokeWidth={2.2} />
              <Icon name="poo" size={17} color={logTint.pooInk} strokeWidth={2.2} />
            </View>
          ) : (
            <Icon name={b.icon} size={19} color={b.fg} strokeWidth={2.2} />
          )}
          <Text numberOfLines={1} style={[styles.tileLabel, { color: b.fg }]}>
            {b.label}
          </Text>
        </Pressable>
      ))}

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
  row: { flexDirection: 'row', gap: 7 },
  tile: {
    flex: 1,
    borderRadius: radius.tile,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 5,
  },
  tilePressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  bothIcons: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileLabel: { fontSize: 11.5, fontFamily: fonts.bold },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '80%',
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: 16,
    ...shadow.card,
  },
  sheetTitle: { fontSize: 15, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 10, textAlign: 'center' },
  option: {
    height: SLOT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.tile,
  },
  optionText: { fontSize: 14, fontFamily: fonts.semiBold, color: ink.primary },
  pressed: { opacity: 0.6, backgroundColor: line.hairline },
});
