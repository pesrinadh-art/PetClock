import { Pressable, StyleSheet, Text, View } from 'react-native';
import { green, ink, line, radius, space, surface, tap } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';
import { Icon } from '../Icon';

/**
 * Friendly step indicator for multi-step forms: "Step 1 of 3" plus one 48px
 * tappable segment per step. The current step is filled green, finished steps
 * show a check (state is never shown by colour alone).
 */
export function StepProgress({
  steps,
  current,
  onSelect,
  canSelect,
}: {
  steps: string[];
  current: number;
  onSelect?: (index: number) => void;
  /** Whether a given step can be jumped to (default: any). */
  canSelect?: (index: number) => boolean;
}) {
  return (
    <View>
      <Text style={styles.caption}>
        Step {current + 1} of {steps.length}
      </Text>
      <View style={styles.row} role="tablist">
        {steps.map((label, i) => {
          const active = i === current;
          const done = i < current;
          const enabled = !!onSelect && (canSelect ? canSelect(i) : true);
          return (
            <Pressable
              key={label}
              role="tab"
              aria-selected={active}
              aria-label={`Step ${i + 1}: ${label}${done ? ', done' : ''}`}
              disabled={!enabled}
              onPress={() => onSelect?.(i)}
              style={({ pressed }) => [styles.seg, pressed && enabled && styles.pressed]}
            >
              <View style={[styles.bar, (active || done) && styles.barOn]} />
              <View style={styles.labelRow}>
                <View style={[styles.dot, active && styles.dotActive, done && styles.dotDone]}>
                  {done ? (
                    <Icon name="check" size={11} color={ink.onDark} strokeWidth={3.2} />
                  ) : (
                    <Text style={[styles.dotText, active && styles.dotTextActive]}>{i + 1}</Text>
                  )}
                </View>
                <Text
                  style={[styles.label, (active || done) && styles.labelOn]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { ...type.caption, color: ink.muted, marginBottom: space.xs },
  row: { flexDirection: 'row', gap: space.xs },
  seg: { flex: 1, minHeight: tap.min, justifyContent: 'flex-start' },
  pressed: { opacity: 0.7 },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: line.border },
  barOn: { backgroundColor: green.mid },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xs },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface.chip,
  },
  dotActive: { backgroundColor: green.tint, borderWidth: 1.5, borderColor: green.mid },
  dotDone: { backgroundColor: green.mid },
  dotText: { fontFamily: fonts.bold, fontSize: 12, color: ink.muted },
  dotTextActive: { color: green.primary },
  label: { ...type.caption, color: ink.muted, flexShrink: 1 },
  labelOn: { color: green.primary, fontFamily: fonts.bold },
});

export default StepProgress;
