import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { accent, glass, ink } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/**
 * Pushed-screen header (design v2 `.ph-bar`): a round glass back (or ✕ close) button, a
 * weight-500 title over a muted subtitle ("Mochi / Mochi's profile"), and an optional trailing
 * slot — by default an accent-soft pencil button when `onEdit` is given.
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
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
        role="button"
        aria-label={variant === 'close' ? 'Close' : 'Back'}
        hitSlop={8}
      >
        <Icon
          name={variant === 'close' ? 'close' : 'chevronLeft'}
          size={variant === 'close' ? 17 : 19}
          color={ink.primary}
          strokeWidth={1.9}
        />
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
            style={({ pressed }) => [styles.iconBtn, styles.editBtn, pressed && styles.pressed]}
            onPress={onEdit}
            role="button"
            aria-label={editLabel ?? 'Edit'}
            hitSlop={8}
          >
            <Icon name="pencil" size={17} color={accent.ink} strokeWidth={1.9} />
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
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  title: { fontSize: 20, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.6, lineHeight: 25 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 1 },
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
  editBtn: { backgroundColor: accent.soft, borderColor: accent.line },
  pressed: { opacity: 0.75, transform: [{ scale: 0.92 }] },
});
