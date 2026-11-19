import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { accent, glass, ink, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { PetAvatar } from './PetAvatar';
import type { Pet } from '../data/mockData';

type Props = {
  pets: Pet[];
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Pet-switcher chips (design v2 `.chips`): glass pills with a small avatar and the pet's
 * name; the selected pet is a solid ink pill with light text. Adding a pet lives on the
 * Pets tab and the tab bar's + button, so there is no trailing add chip here.
 */
export function PetSwitcher({ pets, activeId, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {pets.map((pet) => {
        const active = pet.id === activeId;
        return (
          <Pressable
            key={pet.id}
            onPress={() => onSelect(pet.id)}
            role="button"
            aria-label={`Switch to ${pet.name}`}
            aria-selected={active}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : styles.chipIdle,
              pressed && styles.pressed,
            ]}
          >
            <PetAvatar pet={pet} size={24} emojiSize={13} style={[styles.avatar, active && styles.avatarActive]} />
            <Text numberOfLines={1} style={[styles.name, active ? styles.nameActive : styles.nameIdle]}>
              {pet.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 6, alignItems: 'center' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingLeft: 7,
    paddingRight: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: ink.primary, borderColor: 'transparent' },
  chipIdle: { backgroundColor: glass.fill, borderColor: glass.border },
  avatar: { backgroundColor: accent.soft, borderWidth: 1, borderColor: accent.line },
  avatarActive: { borderColor: 'transparent' },
  name: { fontSize: 13, fontFamily: fonts.medium, maxWidth: 160 },
  nameActive: { color: ink.onDark },
  nameIdle: { color: ink.primary },
});
