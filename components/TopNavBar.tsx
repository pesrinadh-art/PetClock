import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, glass, ink, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from './Icon';
import { PetAvatar } from './PetAvatar';
import { BrandMark } from './BrandMark';

/** "Good morning" / "Good afternoon" / "Good evening" / "Late-night check-in" for the header eyebrow. */
export { greeting } from '../lib/petVoice';

/**
 * Tab-screen header (design v2 `.ph-head`): an optional round pet avatar, a small muted
 * greeting over a weight-500 title ("Good afternoon / Mochi's day", "Family / Your pets"),
 * and two round glass icon buttons on the right — a bell with a warn dot, and the
 * settings gear.
 */
export function TopNavBar({
  title,
  eyebrow,
  pet,
  logo = false,
  action,
}: {
  title: string;
  eyebrow?: string;
  pet?: { id: string; avatarEmoji: string } | null;
  /** Show the PawClock logo on the left instead of a pet avatar (Today, where the hero already shows the pet). */
  logo?: boolean;
  /** Optional extra round button before the bell (e.g. "+" to add a pet or a visit). */
  action?: { icon: IconName; label: string; onPress: () => void };
}) {
  return (
    <View style={styles.container}>
      {logo ? (
        <BrandMark size={44} />
      ) : pet ? (
        <PetAvatar pet={pet} size={40} emojiSize={20} style={styles.avatar} />
      ) : null}
      <View style={styles.text}>
        {!!eyebrow && (
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        )}
        <Text style={styles.title} numberOfLines={1} role="heading">
          {title}
        </Text>
      </View>
      <View style={styles.actions}>
        {action ? (
          <Pressable
            style={({ pressed }) => [styles.iconBtn, styles.actionBtn, pressed && styles.pressed]}
            onPress={action.onPress}
            role="button"
            aria-label={action.label}
            hitSlop={8}
          >
            <Icon name={action.icon} size={18} color={accent.onAccent} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={() => router.push('/notifications')}
          role="button"
          aria-label="Notifications"
          hitSlop={8}
        >
          <Icon name="bell" size={18} color={ink.primary} strokeWidth={1.8} />
          <View style={styles.dot} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={() => router.push('/settings')}
          role="button"
          aria-label="Settings"
          hitSlop={8}
        >
          <Icon name="gear" size={18} color={ink.primary} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 8,
  },
  avatar: {
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderColor: accent.line,
  },
  text: { flex: 1 },
  eyebrow: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted },
  title: {
    fontSize: 24,
    fontFamily: fonts.medium,
    color: ink.primary,
    letterSpacing: -0.85,
    lineHeight: 28,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: { backgroundColor: accent.primary, borderColor: accent.primary },
  pressed: { opacity: 0.75, transform: [{ scale: 0.92 }] },
  dot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: warn.primary,
    borderWidth: 1.5,
    borderColor: glass.highlight,
  },
});
