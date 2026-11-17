import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { green, ink, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/**
 * Pushed-screen header (redesign v3): a round back (or ✕ close) chip, a bold title over a muted
 * subtitle ("Mochi / Mochi's profile"), and an optional trailing slot — by default a green
 * pencil chip when `onEdit` is given.
 */
export function ScreenHeader({
  title,
  subtitle,
  onEdit,
  editLabel,
  right,
  variant = 'back',
  fallback = '/(tabs)',
}: {
  title: string;
  subtitle?: string;
  onEdit?: () => void;
  editLabel?: string;
  right?: ReactNode;
  variant?: 'back' | 'close';
  /** Where to go when there is no history to pop. */
  fallback?: Href;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
        role="button"
        aria-label={variant === 'close' ? 'Close' : 'Back'}
        hitSlop={8}
      >
        <Icon name={variant === 'close' ? 'close' : 'chevronLeft'} size={variant === 'close' ? 18 : 20} color={ink.primary} strokeWidth={2.3} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1} role="heading">
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ??
        (onEdit ? (
          <Pressable
            style={({ pressed }) => [styles.chip, styles.editChip, pressed && styles.pressed]}
            onPress={onEdit}
            role="button"
            aria-label={editLabel ?? 'Edit'}
            hitSlop={8}
          >
            <Icon name="pencil" size={19} color={green.primary} strokeWidth={2.1} />
          </Pressable>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 23, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.6 },
  subtitle: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 1 },
  chip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editChip: { backgroundColor: green.tint },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
