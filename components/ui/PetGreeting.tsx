import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, space } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { PetAvatar } from '../PetAvatar';
import { greeting, petDayTitle } from '../../lib/petVoice';

/**
 * The friendly, pet-first page header: avatar + "Good morning" eyebrow +
 * a big warm title ("Mochi's day") + optional one-line subtitle, with a
 * right slot for IconButtons (bell / settings / edit).
 *
 *   <PetGreeting pet={activePet} now={now} subtitle="2 of 3 meals done"
 *     right={<IconButton icon="bell" dot accessibilityLabel="Notifications" onPress={...} />} />
 *
 * Without a pet (e.g. the Pets / Family tabs) pass `title` and it renders the
 * same rhythm without an avatar:
 *   <PetGreeting title="Your pets" eyebrow="3 in your care" />
 *
 * `title` / `eyebrow` override the generated copy. Pass `now` from `useNow()`
 * so the greeting flips from morning to afternoon without a reload.
 */
export function PetGreeting({
  pet,
  title,
  eyebrow,
  subtitle,
  right,
  now,
  avatarSize = 56,
  style,
}: {
  pet?: { id: string; avatarEmoji: string; name: string } | null;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  right?: React.ReactNode;
  now?: Date;
  avatarSize?: number;
  style?: ViewStyle;
}) {
  const at = now ?? new Date();
  const heading = title ?? (pet ? petDayTitle(pet.name, at) : 'Hello!');
  const eyebrowText = eyebrow ?? greeting(at);
  return (
    <View style={[styles.row, style]}>
      {pet ? <PetAvatar pet={pet} size={avatarSize} ring /> : null}
      <View style={styles.text}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrowText}
        </Text>
        <Text style={styles.title} numberOfLines={1} role="heading">
          {heading}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  text: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.bodySm, fontFamily: type.caption.fontFamily, color: ink.muted },
  title: { ...type.display, color: ink.primary, marginTop: 1 },
  subtitle: { ...type.bodySm, color: ink.muted, marginTop: 3 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});

export default PetGreeting;
