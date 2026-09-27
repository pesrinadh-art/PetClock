import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ink, line, radius, shadow, space, surface, tap, tones, type Tone } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { repos } from '../lib/repo/types';
import { friendlyAgo, loggedLine } from '../lib/petVoice';
import { AppModal } from './AppModal';
import { Icon, type IconName } from './Icon';
import { useSnackbar } from './Snackbar';
import { Button, successFeedback } from './ui';

/** Which quick-log a tap/long-press targets. 'both' writes a pee AND a poo; 'fed' writes a meal. */
type LogTarget = 'pee' | 'poo' | 'both' | 'fed';

type LogButtonSpec = {
  key: LogTarget;
  icon: IconName;
  label: string;
  tone: Tone;
};

/** When each type was last logged (ISO string), for the "2h ago" sublabels. */
export type LastLogged = { pee?: string | null; poo?: string | null; food?: string | null };

/** Backdate presets offered by the long-press chooser (minutes before now). */
const PRESETS: { label: string; minutesAgo: number }[] = [
  { label: 'Just now', minutesAgo: 0 },
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
const SLOT_HEIGHT = 50;

function targetLabel(target: LogTarget): string {
  if (target === 'pee') return 'Pee';
  if (target === 'poo') return 'Poo';
  if (target === 'fed') return 'Meal';
  return 'Pee + poo';
}

const BUTTONS: LogButtonSpec[] = [
  { key: 'pee', icon: 'drop', label: 'Pee', tone: 'pee' },
  { key: 'poo', icon: 'poo', label: 'Poo', tone: 'poo' },
  // "Both" = pee + poo; the render shows BOTH type icons so it reads as one trip.
  { key: 'both', icon: 'drop', label: 'Both', tone: 'groom' },
  { key: 'fed', icon: 'bowl', label: 'Fed', tone: 'food' },
];

function sublabelFor(key: LogTarget, last: LastLogged | undefined, now: Date): string {
  if (key === 'both') return 'One trip';
  const iso = key === 'fed' ? last?.food : last?.[key];
  if (!last) return key === 'fed' ? 'Log a meal' : 'Tap to log';
  return iso ? friendlyAgo(iso, now) : 'Not yet';
}

/**
 * The quick-log grid on Home: Pee / Poo / Both / Fed as four big (2x2) one-thumb
 * tiles with a tinted icon bubble and a "2h ago" line. Tapping writes the log(s)
 * immediately and shows a warm snackbar with a single Undo; long-pressing opens
 * the "when?" backdate chooser. "Both" writes a pee and a poo at the same
 * instant; "Fed" writes a generic meal log. All writes go through the same
 * `repos.logs.add` path as before.
 */
export function LogButtons({ pet, lastLogged, now }: { pet: Pet; lastLogged?: LastLogged; now?: Date }) {
  const { removeLog } = useLogs();
  const { show } = useSnackbar();
  const at = now ?? new Date();

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
    successFeedback();
    // One Undo removes every log this action wrote (both, for the "Both" button).
    show(loggedLine(pet, target === 'fed' ? 'food' : target), () => ids.forEach((id) => removeLog(id)));
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
      <View style={styles.grid}>
        {BUTTONS.map((b) => {
          const t = tones[b.tone];
          const sub = sublabelFor(b.key, lastLogged, at);
          return (
            <Pressable
              key={b.key}
              onPress={() => void commit(b.key)}
              onLongPress={() => setChooser(b.key)}
              delayLongPress={300}
              role="button"
              aria-label={`Log ${targetLabel(b.key).toLowerCase()} for ${pet.name}. Long press to pick a time.`}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <View style={[styles.bubble, { backgroundColor: t.bg }]}>
                {b.key === 'both' ? (
                  <View style={styles.bothIcons}>
                    <Icon name="drop" size={18} color={tones.pee.ink} strokeWidth={2.2} />
                    <Icon name="poo" size={18} color={tones.poo.ink} strokeWidth={2.2} />
                  </View>
                ) : (
                  <Icon name={b.icon} size={24} color={t.ink} strokeWidth={2.1} />
                )}
              </View>
              <View style={styles.tileText}>
                <Text numberOfLines={1} style={styles.tileLabel}>
                  {b.label}
                </Text>
                <Text numberOfLines={1} style={styles.tileSub}>
                  {sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

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
              {chooser === 'fed' ? `When did ${pet.name} eat?` : `When did ${pet.name} go?`}
            </Text>
            {chooser ? (
              <Text style={styles.sheetSub}>
                {chooser === 'fed' ? 'Logging a meal' : `Logging ${targetLabel(chooser).toLowerCase()}`}
              </Text>
            ) : null}
            <View style={styles.options}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  onPress={() => handlePreset(p.minutesAgo)}
                  role="button"
                  aria-label={p.label}
                >
                  <Icon name="clock" size={18} color={ink.muted} strokeWidth={2} />
                  <Text style={styles.optionText}>{p.label}</Text>
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                onPress={openCustom}
                role="button"
                aria-label="Pick another time"
              >
                <Icon name="calendar" size={18} color={ink.muted} strokeWidth={2} />
                <Text style={styles.optionText}>Pick another time…</Text>
              </Pressable>
            </View>
            <Button label="Cancel" variant="ghost" size="md" fullWidth onPress={() => setChooser(null)} />
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
            <Text style={styles.sheetSub}>Later times count as yesterday.</Text>
            <FlatList
              data={TIME_SLOTS}
              keyExtractor={(t) => t.label}
              style={{ maxHeight: 320 }}
              getItemLayout={(_, index) => ({ length: SLOT_HEIGHT, offset: SLOT_HEIGHT * index, index })}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
                  onPress={() => handleCustom(item.hours, item.minutes)}
                  role="button"
                  aria-label={item.label}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
            <Button label="Cancel" variant="ghost" size="md" fullWidth onPress={() => setCustomFor(null)} />
          </Pressable>
        </Pressable>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.card,
    backgroundColor: surface.card,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    ...shadow.card,
  },
  tilePressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  bubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bothIcons: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  tileText: { flex: 1, minWidth: 0 },
  tileLabel: { ...type.subhead, fontSize: 17, color: ink.primary },
  tileSub: { ...type.caption, color: ink.muted, marginTop: 1 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '80%',
    backgroundColor: surface.card,
    borderRadius: radius.sheet,
    padding: space.xl,
    ...shadow.card,
  },
  sheetTitle: { ...type.title, fontSize: 20, color: ink.primary, textAlign: 'center' },
  sheetSub: { ...type.bodySm, color: ink.muted, textAlign: 'center', marginTop: 4, marginBottom: space.sm },
  options: { gap: 6, marginBottom: space.xs },
  option: {
    minHeight: tap.min + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.tile,
    backgroundColor: surface.chip,
  },
  slot: {
    height: SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.tile,
  },
  optionText: { fontSize: 16, fontFamily: fonts.semiBold, color: ink.primary },
  pressed: { opacity: 0.7, backgroundColor: line.hairline },
});
