import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { surface, ink, radius, shadow, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { PetAvatar } from './PetAvatar';
import type { Pet } from '../data/mockData';

/**
 * A pet row on the Pets list: a white card whose main area opens the pet
 * profile (where meals, meds and records now live). Editing is reached inside
 * that profile; the trailing control here is a quiet delete affordance.
 */
export function PetListItem({
  pet,
  onDelete,
}: {
  pet: Pet;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
        onPress={() => router.push({ pathname: '/pet/[id]', params: { id: pet.id } })}
        role="button"
        aria-label={`Open ${pet.name}`}
      >
        <PetAvatar pet={pet} size={44} emojiSize={22} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.name}>{pet.name}</Text>
          <Text numberOfLines={1} style={styles.sub}>{pet.breed || 'No details yet'}</Text>
        </View>
        <Icon name="chevronRight" size={16} color="#c0b8a8" strokeWidth={2.3} />
      </Pressable>
      {onDelete && (
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.deletePressed]}
          onPress={onDelete}
          role="button"
          aria-label={`Delete ${pet.name}`}
          hitSlop={8}
        >
          <Icon name="close" size={15} color={terracotta.primary} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    marginBottom: 10,
    ...shadow.card,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  mainPressed: { opacity: 0.6 },
  avatar: { backgroundColor: surface.chip },
  name: { fontSize: 15, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.2 },
  sub: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: terracotta.tint,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deletePressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
});
