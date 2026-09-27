import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { green, ink, space, terracotta } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import { IconButton } from './ui/IconButton';
import { PetAvatar } from './PetAvatar';

/**
 * Top bar for the tab screens. Bell (with amber dot) + settings chips on the
 * right - both 44px with hitSlop, so >= 48px targets.
 *
 * With no props it shows the PawClock wordmark (back-compat). Pet-owner
 * redesign: pass `title` (and optionally `eyebrow` + `pet`) to turn it into a
 * warm, personal header:
 *
 *   <TopNavBar />                                               // wordmark
 *   <TopNavBar eyebrow="Good morning" title="Mochi's day" pet={activePet} />
 *   <TopNavBar title="Your pets" eyebrow="3 in your care" />
 *
 * Navigation targets are unchanged (/notifications, /settings).
 */
export function TopNavBar({
  title,
  eyebrow,
  pet,
  showBell = true,
  showSettings = true,
}: {
  title?: string;
  eyebrow?: string;
  pet?: { id: string; avatarEmoji: string; name?: string } | null;
  showBell?: boolean;
  showSettings?: boolean;
} = {}) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {pet ? <PetAvatar pet={pet} size={44} ring /> : null}
        {title ? (
          <View style={styles.titleWrap}>
            {!!eyebrow && (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {eyebrow}
              </Text>
            )}
            <Text style={styles.title} numberOfLines={1} role="heading">
              {title}
            </Text>
          </View>
        ) : (
          <Text style={styles.logo} aria-label="PawClock">
            <Text style={{ color: green.primary }}>Paw</Text>
            <Text style={{ color: terracotta.primary }}>Clock</Text>
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {showBell && (
          <IconButton
            icon="bell"
            dot
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications')}
          />
        )}
        {showSettings && (
          <IconButton icon="gear" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.gutter,
    paddingTop: space.xs + 2,
    paddingBottom: space.sm,
    minHeight: 64,
  },
  left: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titleWrap: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.bodySm, fontFamily: fonts.semiBold, color: ink.muted },
  title: { ...type.title, color: ink.primary },
  logo: { fontSize: 22, fontFamily: fonts.extraBold, letterSpacing: -0.4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
