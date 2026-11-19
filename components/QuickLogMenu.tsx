import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { accent, glass, ink, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';
import { useLogs } from '../context/LogsContext';
import { repos } from '../lib/repo/types';
import { loggedLine } from '../lib/petVoice';
import { presentLogType } from '../lib/care/logTypes';
import type { QuickLogAction } from '../lib/care/types';
import { useCareOutputs } from '../lib/care/useCareOutputs';
import { AppModal } from './AppModal';
import { Icon } from './Icon';
import { useSnackbar } from './Snackbar';

/**
 * The "+ Log" quick-log menu (design v2): tapping the tab bar's + Log fans the pet's
 * quick-log actions out as line-icon circles in an arc over a dimmed screen. Tap a circle
 * to log now; press and hold one to pick when it happened.
 *
 * The actions come from the pet's care modules (`useCareOutputs(...).quickLog`): with
 * potty and meals on that is today's Pee / Poo / Both / Fed. Each action's `writes` are
 * recorded through `repos.logs.add` at ONE instant (so "Both" is a pee and a poo at the
 * same time), and one Undo reverts the whole action.
 */

/** At most this many circles fit the arc. */
export const QUICK_LOG_MAX = 5;

/**
 * The arc the circles fan out on: a slightly squashed circle lifted above the + Log button,
 * spanning ±ARC_SPREAD_DEG. Tuned so four items land exactly on the original design
 * positions (±108,-96) and (±46,-162).
 */
const ARC_RADIUS = 114;
const ARC_SQUASH = 110 / 114;
const ARC_LIFT = 61 / 114;
const ARC_SPREAD_DEG = 71.4;

/**
 * Offsets (px, from the + Log button's centre; dy negative = up) for `n` items spread evenly
 * along the arc, left to right. `radius` scales the whole arc.
 */
export function arcLayout(n: number, radius: number = ARC_RADIUS): { dx: number; dy: number }[] {
  if (n <= 0) return [];
  const spread = (ARC_SPREAD_DEG * Math.PI) / 180;
  const out: { dx: number; dy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const theta = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1);
    const dx = Math.round(radius * Math.sin(theta));
    const dy = -Math.round(radius * ARC_LIFT + radius * ARC_SQUASH * Math.cos(theta));
    out.push({ dx: dx === 0 ? 0 : dx, dy });
  }
  return out;
}

const PRESETS: { label: string; minutesAgo: number }[] = [
  { label: 'Now', minutesAgo: 0 },
  { label: '15 min ago', minutesAgo: 15 },
  { label: '30 min ago', minutesAgo: 30 },
  { label: '1 hour ago', minutesAgo: 60 },
];

const MINUTE_MS = 60 * 1000;
const CIRCLE = 58;
const SLOT_HEIGHT = 46;

/** Half-hour clock slots for "Pick a time" (12:00 AM … 11:30 PM). */
const TIME_SLOTS = (() => {
  const slots: { label: string; hours: number; minutes: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      slots.push({ label: `${hour12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`, hours: h, minutes: m });
    }
  }
  return slots;
})();

function successHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * Write the log(s) for one quick-log `action`, then show the "logged" snackbar whose Undo
 * removes them all. Several writes share one instant (the time picked, else now); a single
 * write leaves `occurredAt` to the repo's "now" default when none was picked.
 */
export function useQuickLog() {
  const { removeLog } = useLogs();
  const { show } = useSnackbar();
  return async (pet: Pet, action: QuickLogAction, occurredAt?: string) => {
    if (action.writes.length === 0) return;
    const at = action.writes.length > 1 ? (occurredAt ?? new Date().toISOString()) : occurredAt;
    const ids: string[] = [];
    for (const write of action.writes) {
      const entry = await repos.logs.add(pet.id, { ...write, occurredAt: at });
      ids.push(entry.id);
    }
    successHaptic();
    // A multi-write action reads as one potty trip ("both"); a single write by its log type.
    const what = action.writes.length > 1 ? 'both' : action.writes[0].type;
    show(loggedLine(pet, what), () => ids.forEach((id) => removeLog(id)));
  };
}

/**
 * Full-screen overlay: scrim, the four arcing circles and a "Close" pill sitting
 * exactly over the tab bar's + Log button. `fabCenterBottom` is the distance from the
 * bottom of the screen to the centre of that button.
 */
export function QuickLogMenu({
  open,
  pet,
  fabCenterBottom,
  onClose,
}: {
  open: boolean;
  pet: Pet | null;
  fabCenterBottom: number;
  onClose: () => void;
}) {
  const quickLog = useQuickLog();
  const care = useCareOutputs(pet?.id);
  const actions = (care?.quickLog ?? []).slice(0, QUICK_LOG_MAX);
  const positions = arcLayout(actions.length);
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  // The action being timed is kept whole, so a re-render can't swap it mid-choice.
  const [chooser, setChooser] = useState<QuickLogAction | null>(null);
  const [custom, setCustom] = useState<QuickLogAction | null>(null);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 260 : 180,
      easing: open ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, anim]);

  const log = (action: QuickLogAction, occurredAt?: string) => {
    if (pet) void quickLog(pet, action, occurredAt);
  };

  return (
    <>
      {mounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
            {/* iOS: real backdrop blur under a light wash. Elsewhere blur is weak, so the
                wash alone is near-opaque to keep the arc readable. */}
            {Platform.OS === 'ios' ? (
              <BlurView intensity={24} tint="light" style={[StyleSheet.absoluteFill, styles.scrimIos]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.scrim]} />
            )}
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} aria-label="Close quick log" />
          </Animated.View>

          <Animated.Text
            style={[styles.hint, { bottom: fabCenterBottom + 214, opacity: anim }]}
            pointerEvents="none"
          >
            {pet ? `Logging for ${pet.name}` : ''}
            {'\n'}
            <Text style={styles.hintSub}>Tap to log now · hold to pick a time</Text>
          </Animated.Text>

          {actions.map((action, i) => {
            const t = anim;
            const item = { ...action, ...positions[i] };
            return (
              <Animated.View
                key={item.key}
                style={[
                  styles.itemWrap,
                  {
                    bottom: fabCenterBottom - CIRCLE / 2,
                    opacity: anim,
                    transform: [
                      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, item.dx] }) },
                      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, item.dy] }) },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                    ],
                  },
                ]}
              >
                <Pressable
                  onPress={() => {
                    onClose();
                    log(action);
                  }}
                  onLongPress={() => {
                    onClose();
                    setChooser(action);
                  }}
                  delayLongPress={350}
                  role="button"
                  aria-label={`Log ${item.label.toLowerCase()}${pet ? ` for ${pet.name}` : ''}. Hold to pick a time.`}
                  style={({ pressed }) => [styles.circle, pressed && styles.circlePressed]}
                  testID={`quicklog-${item.key}`}
                >
                  {item.writes.length > 1 ? (
                    // A multi-log action shows each log's glyph side by side (Both = drop + poo).
                    <View style={styles.bothIcons}>
                      {item.writes.map((w, wi) => (
                        <Icon
                          key={`${w.type}-${wi}`}
                          name={presentLogType(w.type).icon}
                          size={17}
                          color={accent.primary}
                          strokeWidth={1.8}
                        />
                      ))}
                    </View>
                  ) : (
                    <Icon name={item.icon} size={24} color={accent.primary} strokeWidth={1.8} />
                  )}
                </Pressable>
                <Text style={styles.itemLabel}>{item.label}</Text>
              </Animated.View>
            );
          })}

          {/* The Close pill sits exactly over the tab bar's + Log button. */}
          <Animated.View style={[styles.closeWrap, { bottom: fabCenterBottom - 23, opacity: anim }]}>
            <Pressable
              onPress={onClose}
              role="button"
              aria-label="Close quick log"
              style={({ pressed }) => [styles.closePill, pressed && { opacity: 0.85 }]}
            >
              <Icon name="close" size={18} color="#ffffff" strokeWidth={2.2} />
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Hold → "When did Mochi pee?" */}
      <AppModal visible={chooser !== null} transparent animationType="fade" onRequestClose={() => setChooser(null)}>
        <Pressable style={styles.overlay} onPress={() => setChooser(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {chooser ? `When did ${pet?.name ?? 'your pet'} ${chooser.verb}?` : ''}
            </Text>
            {PRESETS.map((p) => (
              <Pressable
                key={p.label}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                onPress={() => {
                  const action = chooser;
                  setChooser(null);
                  if (action)
                    log(action, p.minutesAgo === 0 ? undefined : new Date(Date.now() - p.minutesAgo * MINUTE_MS).toISOString());
                }}
                role="button"
                aria-label={p.label}
              >
                <Text style={styles.optionText}>{p.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => {
                setCustom(chooser);
                setChooser(null);
              }}
              role="button"
              aria-label="Pick a time"
            >
              <Text style={[styles.optionText, { color: accent.ink }]}>Pick a time…</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>

      <AppModal visible={custom !== null} transparent animationType="fade" onRequestClose={() => setCustom(null)}>
        <Pressable style={styles.overlay} onPress={() => setCustom(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Pick a time</Text>
            <FlatList
              data={TIME_SLOTS}
              keyExtractor={(t) => t.label}
              style={{ maxHeight: 320 }}
              initialScrollIndex={Math.max(0, new Date().getHours() * 2 - 2)}
              getItemLayout={(_, index) => ({ length: SLOT_HEIGHT, offset: SLOT_HEIGHT * index, index })}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => {
                    const action = custom;
                    setCustom(null);
                    if (!action) return;
                    const d = new Date();
                    d.setHours(item.hours, item.minutes, 0, 0);
                    // A time later than now belongs to yesterday — a backdate is always past.
                    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
                    log(action, d.toISOString());
                  }}
                  role="button"
                  aria-label={item.label}
                >
                  <Text style={[styles.optionText, styles.mono]}>{item.label}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(244,244,247,0.9)' },
  scrimIos: { backgroundColor: glass.scrim },
  hint: {
    position: 'absolute',
    left: 24,
    right: 24,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 14,
    color: ink.primary,
    lineHeight: 20,
  },
  hintSub: { fontFamily: fonts.monoRegular, fontSize: 11.5, color: ink.muted },
  itemWrap: {
    position: 'absolute',
    left: '50%',
    marginLeft: -CIRCLE / 2,
    width: CIRCLE,
    alignItems: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hero,
  },
  circlePressed: { transform: [{ scale: 0.92 }], backgroundColor: accent.soft },
  bothIcons: { flexDirection: 'row', alignItems: 'center' },
  itemLabel: { marginTop: 6, fontFamily: fonts.medium, fontSize: 12.5, color: ink.primary },
  closeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  closePill: {
    height: 46,
    paddingLeft: 14,
    paddingRight: 18,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ink.primary,
  },
  closeText: { fontFamily: fonts.medium, fontSize: 13.5, color: '#ffffff' },

  overlay: { flex: 1, backgroundColor: glass.scrimDark, justifyContent: 'flex-end', padding: 12 },
  sheet: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: surface.solid,
    borderRadius: radius.sheet,
    padding: 16,
    paddingBottom: 20,
    ...shadow.hero,
  },
  sheetTitle: { fontSize: 16, fontFamily: fonts.medium, letterSpacing: -0.3, color: ink.primary, marginBottom: 8, textAlign: 'center' },
  option: {
    height: SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.tile,
  },
  optionPressed: { backgroundColor: accent.soft },
  optionText: { fontSize: 14.5, fontFamily: fonts.medium, color: ink.primary },
  mono: { fontFamily: fonts.mono },
});
