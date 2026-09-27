import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { green, ink, line, radius, space, surface, tap } from '../theme/colors';
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
 * Pet switcher: one 48px chip per pet (ringed avatar + name). The active pet
 * gets a green tint, a green ring and a check so selection never relies on
 * colour alone. A trailing "Add pet" chip opens the add-pet flow (unchanged).
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
            aria-label={active ? `${pet.name}, selected` : `Switch to ${pet.name}`}
            aria-selected={active}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : styles.chipIdle,
              pressed && styles.pressed,
            ]}
          >
            <PetAvatar pet={pet} size={34} emojiSize={19} ring={active ? 'active' : 'light'} />
            <Text numberOfLines={1} style={[styles.name, active ? styles.nameActive : styles.nameIdle]}>
              {pet.name}
            </Text>
            {active ? <Icon name="check" size={14} color={green.primary} strokeWidth={2.8} /> : null}
          </Pressable>
        );
      })}
      <Pressable
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        onPress={() => router.push('/add-pet')}
        role="button"
        aria-label="Add another pet"
      >
        <Icon name="plus" size={16} color={green.primary} strokeWidth={2.4} />
        <Text style={styles.addText}>Add pet</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { paddingHorizontal: space.gutter, paddingBottom: space.sm, paddingTop: 2, gap: space.xs, alignItems: 'center' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  chip: {
    minHeight: tap.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipActive: { backgroundColor: green.tint, borderColor: green.tintBorder },
  chipIdle: { backgroundColor: surface.card, borderColor: line.border },
  name: { fontSize: 15, fontFamily: fonts.bold, maxWidth: 150 },
  nameActive: { color: green.primary },
  nameIdle: { color: ink.primary },
  add: {
    minHeight: tap.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: line.dashed,
    borderStyle: 'dashed',
  },
  addText: { fontSize: 14, fontFamily: fonts.bold, color: green.primary },
});
