import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { amber, green, ink, radius, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/**
 * Home header (screen 2a): the PawClock wordmark (green "Paw" + terracotta
 * "Clock") on the left, and two round chip buttons on the right — a bell with an
 * amber unread dot and the settings gear. Both glyphs are drawn <Icon>s.
 */
export function TopNavBar() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        <Text style={{ color: green.primary }}>Paw</Text>
        <Text style={{ color: terracotta.primary }}>Clock</Text>
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          onPress={() => router.push('/notifications')}
          role="button"
          aria-label="Notifications"
          hitSlop={8}
        >
          <Icon name="bell" size={17} color={ink.muted} strokeWidth={1.9} />
          <View style={styles.dot} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          onPress={() => router.push('/settings')}
          role="button"
          aria-label="Settings"
          hitSlop={8}
        >
          <Icon name="gear" size={17} color={ink.muted} strokeWidth={1.9} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  logo: { fontSize: 20, fontFamily: fonts.extraBold, letterSpacing: -0.4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.92 }] },
  dot: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: amber.primary,
    borderWidth: 1.5,
    borderColor: surface.app,
  },
});
