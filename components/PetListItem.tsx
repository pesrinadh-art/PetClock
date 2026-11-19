import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, ink, line } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { PetAvatar } from './PetAvatar';
import type { Pet } from '../data/mockData';

/**
 * A pet row on the Pets list (design v2 `.list.glass > .row`): a ringed avatar, the pet's name
 * and "breed · Meals, meds and care diary", inside the shared glass list card the screen wraps
 * around every row. The main area opens the pet profile; the trailing ghost trash button is the
 * (confirm-gated) delete affordance. Set `divider` on all but the last row.
 */
export function PetListItem({
  pet,
  onDelete,
  divider = false,
}: {
  pet: Pet;
  onDelete?: () => void;
  /** Inset hairline under the row (all rows but the last). */
  divider?: boolean;
}) {
  return (
    <>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
          onPress={() => router.push({ pathname: '/pet/[id]', params: { id: pet.id } })}
          role="button"
          aria-label={`Open ${pet.name}`}
        >
          <PetAvatar pet={pet} size={44} emojiSize={22} style={styles.avatar} />
          <View style={styles.text}>
            <Text numberOfLines={1} style={styles.name}>{pet.name}</Text>
            <Text numberOfLines={1} style={styles.sub}>{pet.breed || 'No details yet'}</Text>
            <Text numberOfLines={1} style={styles.hint}>Meals, meds and care diary</Text>
          </View>
          <Icon name="chevronRight" size={15} color={ink.placeholder} strokeWidth={2} />
        </Pressable>
        {onDelete && (
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.deletePressed]}
            onPress={onDelete}
            role="button"
            aria-label={`Delete ${pet.name}`}
            hitSlop={8}
          >
            <Icon name="trash" size={17} color={ink.muted} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
      {divider && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minHeight: 44 },
  mainPressed: { opacity: 0.6 },
  avatar: { backgroundColor: accent.soft, borderWidth: 1, borderColor: accent.line },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.2 },
  sub: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 1 },
  hint: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 1 },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deletePressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 14 },
});
