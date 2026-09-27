import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, radius, space, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { type IconName } from '../Icon';
import { IconTile } from './IconTile';
import { Button } from './Button';

/**
 * A gentle, tinted callout: due/overdue nudges, meal-time prompts, tips, and
 * small-win celebrations. Colour = role:
 *   tone="attention" - something is due / a little late (amber, never red)
 *   tone="food"      - meal time
 *   tone="pet"       - a win / all done / good news
 *   tone="vet" | "med" - care reminders
 *
 *   <Banner tone="food" icon="bowl" title="Time for Mochi's dinner"
 *     body="Usually around 6:00 PM" action={{ label: 'Log dinner', onPress: logDinner }} />
 *
 *   <Banner tone="pet" icon="sparkle" title="All meals done today!" compact />
 *
 * The action renders as a solid tone Button (48px) under the text so it's
 * always thumb-sized. `onPress` makes the whole banner tappable instead.
 */
export function Banner({
  tone = 'attention',
  icon,
  title,
  body,
  action,
  secondaryAction,
  onPress,
  compact = false,
  style,
}: {
  tone?: Tone;
  icon?: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName; accessibilityLabel?: string };
  secondaryAction?: { label: string; onPress: () => void; accessibilityLabel?: string };
  onPress?: () => void;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const t = tones[tone];
  const content = (
    <>
      <View style={styles.top}>
        {icon ? <IconTile icon={icon} size={compact ? 36 : 42} bg="rgba(255,255,255,0.7)" color={t.ink} /> : null}
        <View style={styles.text}>
          <Text style={[styles.title, { color: tone === 'neutral' ? ink.primary : t.ink }]}>{title}</Text>
          {!!body && <Text style={styles.body}>{body}</Text>}
        </View>
      </View>
      {(action || secondaryAction) && (
        <View style={styles.actions}>
          {action ? (
            <Button
              label={action.label}
              icon={action.icon}
              onPress={action.onPress}
              accessibilityLabel={action.accessibilityLabel}
              tone={tone}
              size="md"
              style={styles.actionBtn}
            />
          ) : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              accessibilityLabel={secondaryAction.accessibilityLabel}
              tone={tone}
              variant="ghost"
              size="md"
            />
          ) : null}
        </View>
      )}
    </>
  );

  const boxStyle = [
    styles.box,
    { backgroundColor: t.bg, borderColor: t.border },
    compact && styles.compact,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        role="button"
        aria-label={title}
        style={({ pressed }) => [...boxStyle, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={boxStyle} role="status">
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.lg,
  },
  compact: { paddingVertical: space.sm, paddingHorizontal: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { flex: 1, minWidth: 0 },
  title: { ...type.subhead },
  body: { ...type.bodySm, color: ink.muted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm, flexWrap: 'wrap' },
  actionBtn: { flexGrow: 1 },
  pressed: { opacity: 0.85 },
});

export default Banner;
