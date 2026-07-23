import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';

type Props = {
  pets: Pet[];
  activeId: string;
  onSelect: (id: string) => void;
};

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
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${pet.name}`}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
          >
            <Text style={styles.avatar}>{pet.avatar}</Text>
            <Text style={styles.name}>{pet.name}</Text>
          </Pressable>
        );
      })}
      <Pressable
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        onPress={() => router.push('/add-pet')}
        accessibilityRole="button"
        accessibilityLabel="Add pet"
      >
        <Text style={{ fontSize: 20, color: colors.stoneLight }}>+</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { paddingHorizontal: 16, paddingVertical: 8, gap: 10, alignItems: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 99,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadow.sm,
  },
  chipActive: { borderColor: colors.sage, backgroundColor: colors.sagePale },
  avatar: { fontSize: 20 },
  name: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.stone },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
});
