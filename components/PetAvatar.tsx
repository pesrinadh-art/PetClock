import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { usePetPhoto } from '../lib/petPhotos';

type Props = {
  /** Only id + avatarEmoji are needed; accepts any pet-shaped object. */
  pet: { id: string; avatarEmoji: string };
  /** Diameter of the round avatar in px. */
  size?: number;
  /** Emoji glyph size for the fallback; defaults to size * 0.5. */
  emojiSize?: number;
  /** Container overrides (background, border, margins). Merged over the base circle. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Presentational pet avatar: shows the device-local photo (round, cropped) when one is set
 * for this pet, otherwise the emoji on a round sagePale circle.
 *
 * This is a COMPONENT (not a helper) on purpose: `usePetPhoto` is a hook, so screens that
 * render many pets must render one <PetAvatar> per item rather than calling the hook inside a
 * .map(). Each instance owns its own hook call, keeping the rules of hooks intact.
 */
export function PetAvatar({ pet, size = 48, emojiSize, style }: Props) {
  const photoUri = usePetPhoto(pet.id);
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  return (
    <View style={[styles.base, circle, style]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={circle} resizeMode="cover" />
      ) : (
        <Text style={{ fontSize: emojiSize ?? Math.round(size * 0.5) }}>{pet.avatarEmoji}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.sagePale,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
