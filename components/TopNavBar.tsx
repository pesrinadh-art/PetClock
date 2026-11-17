import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, ink, radius, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { PetAvatar } from './PetAvatar';

/** "Good morning" / "Good afternoon" / "Good evening" / "Late-night check-in" for the header eyebrow. */
export { greeting } from '../lib/petVoice';

/**
 * Screen header (redesign v3): an optional round pet avatar, a small muted eyebrow over a
 * bold title ("Good afternoon / Mochi's day", "Family / Your pets"), and two round chip
 * buttons on the right — a bell with an amber unread dot, and the settings gear.
 */
export function TopNavBar({
  title,
  eyebrow,
  pet,
}: {
  title: string;
  eyebrow?: string;
  pet?: { id: string; avatarEmoji: string } | null;
}) {
  return (
    <View style={styles.container}>
      {pet ? <PetAvatar pet={pet} size={46} emojiSize={24} style={styles.avatar} /> : null}
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
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          onPress={() => router.push('/notifications')}
          role="button"
          aria-label="Notifications"
          hitSlop={8}
        >
          <Icon name="bell" size={19} color={ink.primary} strokeWidth={1.9} />
          <View style={styles.dot} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          onPress={() => router.push('/settings')}
          role="button"
          aria-label="Settings"
          hitSlop={8}
        >
          <Icon name="gear" size={19} color={ink.primary} strokeWidth={1.9} />
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  avatar: {
    backgroundColor: '#e8efe6',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#2a2724',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  text: { flex: 1 },
  eyebrow: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted },
  title: { fontSize: 23, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.6, marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.92 }] },
  dot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: amber.primary,
    borderWidth: 1.5,
    borderColor: surface.chip,
  },
});
