import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { Pet } from '../data/mockData';

export function PetListItem({
  pet,
  onEdit,
  onDelete,
}: {
  pet: Pet;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={{ fontSize: 24 }}>{pet.avatar}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{pet.name}</Text>
        <Text style={styles.sub}>{[pet.breed, pet.age].filter(Boolean).join(' · ') || 'No details yet'}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.iconBtn, styles.editBtn, pressed && styles.iconBtnPressed]}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${pet.name}`}
        hitSlop={8}
      >
        <Text style={styles.iconBtnText}>✏️</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.iconBtn, styles.deleteBtn, pressed && styles.iconBtnPressed]}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${pet.name}`}
        hitSlop={8}
      >
        <Text style={styles.iconBtnText}>🗑️</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.sagePale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.stone },
  sub: { fontSize: 12, color: colors.stoneMid, marginTop: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: { backgroundColor: colors.sagePale },
  deleteBtn: { backgroundColor: '#FDECEA' },
  iconBtnPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  iconBtnText: { fontSize: 15 },
});
