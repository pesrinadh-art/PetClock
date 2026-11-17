import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { surface, ink, radius, shadow, green } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { PetAvatar } from './PetAvatar';
import type { Pet } from '../data/mockData';

/**
 * A pet row on the Pets list (redesign v3): a white card with a large ringed avatar, the
 * pet's name, breed and "Meals, meds and care diary". The main area opens the pet profile;
 * the trailing trash icon is the (confirm-gated) delete affordance.
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
        <PetAvatar pet={pet} size={60} emojiSize={30} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.name}>{pet.name}</Text>
          <Text numberOfLines={1} style={styles.sub}>{pet.breed || 'No details yet'}</Text>
          <Text numberOfLines={1} style={styles.hint}>Meals, meds and care diary</Text>
        </View>
        <Icon name="chevronRight" size={17} color={ink.faint} strokeWidth={2.2} />
      </Pressable>
      {onDelete && (
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.deletePressed]}
          onPress={onDelete}
          role="button"
          aria-label={`Delete ${pet.name}`}
          hitSlop={8}
        >
          <Icon name="trash" size={19} color={ink.primary} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 10,
    marginBottom: 12,
    ...shadow.card,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  mainPressed: { opacity: 0.6 },
  avatar: { backgroundColor: green.tint, borderWidth: 3, borderColor: '#ffffff', ...shadow.sm },
  name: { fontSize: 17, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.3 },
  sub: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  hint: { fontSize: 12, fontFamily: fonts.semiBold, color: ink.muted, marginTop: 5 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deletePressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
});
