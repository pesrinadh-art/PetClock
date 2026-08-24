import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { green, ink, line, radius, surface } from '../theme/colors';
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
 * Pet-switcher chips (screen 2a): the selected pet is a green pill — a white
 * avatar circle + name — and every other pet a muted pill. A trailing dashed
 * ＋ chip adds a new pet.
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
              size={24}
              emojiSize={15}
              style={[styles.avatar, active ? styles.avatarActive : styles.avatarIdle]}
            />
            <Text
              numberOfLines={1}
              style={[styles.name, active ? styles.nameActive : styles.nameIdle]}
            >
              {pet.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        onPress={() => router.push('/add-pet')}
        role="button"
        aria-label="Add pet"
      >
        <Icon name="plus" size={15} color={ink.faint2} strokeWidth={2.2} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { paddingHorizontal: 20, paddingBottom: 14, gap: 8, alignItems: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipActive: { backgroundColor: green.tint, borderColor: green.tintBorder },
  chipIdle: { backgroundColor: surface.chip, borderColor: 'transparent' },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  avatarActive: { backgroundColor: '#ffffff' },
  avatarIdle: { backgroundColor: '#ffffff' },
  name: { fontSize: 13, fontFamily: fonts.bold, maxWidth: 160 },
  nameActive: { color: ink.primary },
  nameIdle: { color: ink.muted },
  add: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: line.dashed,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
