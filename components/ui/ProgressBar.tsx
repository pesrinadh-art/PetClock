import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, line, space, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';

/**
 * Simple, friendly progress: "2 of 3 meals" with a rounded bar. Pairs with
 * `progressLine()` from lib/petVoice for the caption.
 *
 *   <ProgressBar value={mealsDone} total={mealsTotal} tone="food"
 *     label="Meals today" caption={progressLine(mealsDone, mealsTotal)} />
 *
 * `variant="onDark"` for use inside the green hero.
 */
export function ProgressBar({
  value,
  total,
  tone = 'pet',
  label,
  caption,
  variant = 'onLight',
  style,
}: {
  value: number;
  total: number;
  tone?: Tone;
  label?: string;
  caption?: string;
  variant?: 'onLight' | 'onDark';
  style?: ViewStyle;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const onDark = variant === 'onDark';
  const track = onDark ? 'rgba(255,255,255,0.22)' : line.hairline;
  const fill = onDark ? '#f3d27a' : tones[tone].solid;
  return (
    <View
      style={style}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-label={label}
    >
      {(label || caption) && (
        <View style={styles.head}>
          {label ? <Text style={[styles.label, onDark && styles.onDarkText]}>{label}</Text> : <View />}
          {caption ? (
            <Text style={[styles.caption, onDark && styles.onDarkMuted]}>{caption}</Text>
          ) : null}
        </View>
      )}
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: space.xs },
  label: { ...type.caption, fontFamily: type.subhead.fontFamily, color: ink.primary },
  caption: { ...type.caption, color: ink.muted },
  onDarkText: { color: '#ffffff' },
  onDarkMuted: { color: 'rgba(255,255,255,0.82)' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});

export default ProgressBar;
