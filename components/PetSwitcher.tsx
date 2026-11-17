import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { green, ink, line, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { PetAvatar } from './PetAvatar';
import type { Pet } from '../data/mockData';

type Props = {
  pets: Pet[];
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Pet-switcher chips (redesign v3): the selected pet is a green-tint pill with a ringed
 * avatar, green name and a check; every other pet is a white pill. Adding a pet lives on the
 * Pets tab and the centre + button, so there is no trailing add chip here.
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
            <PetAvatar
              pet={pet}
              size={32}
              emojiSize={18}
              style={[styles.avatar, active && styles.avatarActive]}
            />
            <Text numberOfLines={1} style={[styles.name, active ? styles.nameActive : styles.nameIdle]}>
              {pet.name}
            </Text>
            {active && <Icon name="check" size={15} color={green.primary} strokeWidth={2.6} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14, gap: 8, alignItems: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipActive: { backgroundColor: green.tint, borderColor: green.tintBorder },
  chipIdle: { backgroundColor: surface.card, borderColor: line.border, ...shadow.sm },
  avatar: { backgroundColor: green.tint, borderWidth: 2, borderColor: '#ffffff' },
  avatarActive: { backgroundColor: '#ffffff', borderColor: green.primary },
  name: { fontSize: 14, fontFamily: fonts.bold, maxWidth: 160 },
  nameActive: { color: green.primary },
  nameIdle: { color: ink.primary },
});
