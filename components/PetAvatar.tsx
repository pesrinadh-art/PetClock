import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { green, surface } from '../theme/colors';
import { usePetPhoto } from '../lib/petPhotos';

type Props = {
  /** Only id + avatarEmoji are needed (name improves the a11y label); accepts any pet-shaped object. */
  pet: { id: string; avatarEmoji: string; name?: string };
  /** Diameter of the round avatar in px. */
  size?: number;
  /** Emoji glyph size for the fallback; defaults to size * 0.52. */
  emojiSize?: number;
  /**
   * Pet-forward ring treatment:
   *  - `true` / 'light' : white ring + soft green halo (on the cream app background / white cards)
   *  - 'onDark'         : translucent white ring (on the green hero gradient)
   *  - 'active'         : solid green ring (the selected pet in a switcher)
   */
  ring?: boolean | 'light' | 'onDark' | 'active';
  /** Tiny corner badge (e.g. a <Icon name="cake"/> on birthdays, a status dot). */
  badge?: React.ReactNode;
  /** Container overrides (background, border, margins). Merged over the base circle. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Presentational pet avatar: shows the device-local photo (round, cropped) when one is set
 * for this pet, otherwise the emoji on a warm green-tint circle.
 *
 * This is a COMPONENT (not a helper) on purpose: `usePetPhoto` is a hook, so screens that
 * render many pets must render one <PetAvatar> per item rather than calling the hook inside a
 * .map(). Each instance owns its own hook call, keeping the rules of hooks intact.
 *
 * Pet-owner redesign: the pet is the hero. Use size >= 56 in heroes / profile headers,
 * 44-48 in rows, 28-32 in chips. Add `ring` wherever the avatar sits on a coloured surface.
 */
export function PetAvatar({ pet, size = 48, emojiSize, ring, badge, style }: Props) {
  const photoUri = usePetPhoto(pet.id);
  const ringWidth = ring ? Math.max(2, Math.round(size * 0.055)) : 0;
  const outer = size + ringWidth * 2;
  const circle = { width: size, height: size, borderRadius: size / 2 };

  const ringStyle: ViewStyle | null = !ring
    ? null
    : ring === 'onDark'
      ? { backgroundColor: 'rgba(255,255,255,0.35)' }
      : ring === 'active'
        ? { backgroundColor: green.mid }
        : {
            backgroundColor: surface.card,
            shadowColor: green.primary,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.18,
            shadowRadius: 8,
            elevation: 3,
          };

  const inner = (
    <View style={[styles.base, circle, !ring && style]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={circle} resizeMode="cover" />
      ) : (
        <Text style={{ fontSize: emojiSize ?? Math.round(size * 0.52) }}>{pet.avatarEmoji}</Text>
      )}
    </View>
  );

  const label = pet.name ? `${pet.name}'s photo` : undefined;

  if (!ring && !badge) {
    return label ? (
      <View aria-label={label} role="img">
        {inner}
      </View>
    ) : (
      inner
    );
  }

  return (
    <View
      aria-label={label}
      role={label ? 'img' : undefined}
      style={[
        { width: outer, height: outer, borderRadius: outer / 2, alignItems: 'center', justifyContent: 'center' },
        ringStyle,
        ring ? style : null,
      ]}
    >
      {inner}
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    backgroundColor: surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: surface.app,
  },
});
