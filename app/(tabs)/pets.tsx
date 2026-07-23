import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { TopNavBar } from '../../components/TopNavBar';
import { SectionTitle } from '../../components/SectionTitle';
import { PetListItem } from '../../components/PetListItem';
import { usePets } from '../../context/PetsContext';
import type { Pet } from '../../data/mockData';

export default function PetsScreen() {
  const { pets, removePet } = usePets();
  const [pendingDelete, setPendingDelete] = useState<Pet | null>(null);
  const [blockedMessage, setBlockedMessage] = useState(false);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const ok = removePet(pendingDelete.id);
    setPendingDelete(null);
    if (!ok) setBlockedMessage(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <SectionTitle>Your Pets</SectionTitle>
        {pets.map((pet) => (
          <PetListItem
            key={pet.id}
            pet={pet}
            onEdit={() => router.push({ pathname: '/add-pet', params: { petId: pet.id } })}
            onDelete={() => setPendingDelete(pet)}
          />
        ))}

        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => router.push('/add-pet')}
        >
          <Text style={styles.addBtnText}>➕ Add Pet</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <Pressable style={styles.overlay} onPress={() => setPendingDelete(null)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Remove {pendingDelete?.name}?</Text>
            <Text style={styles.dialogBody}>
              This deletes their profile and log history. This can't be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setPendingDelete(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.pressed]}
                onPress={confirmDelete}
              >
                <Text style={styles.deleteBtnText}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={blockedMessage} transparent animationType="fade" onRequestClose={() => setBlockedMessage(false)}>
        <Pressable style={styles.overlay} onPress={() => setBlockedMessage(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Can't remove your last pet</Text>
            <Text style={styles.dialogBody}>PawClock needs at least one pet. Add another before removing this one.</Text>
            <Pressable
              style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed, { marginTop: 4 }]}
              onPress={() => setBlockedMessage(false)}
            >
              <Text style={styles.cancelBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  addBtn: {
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnPressed: { backgroundColor: colors.sagePale, borderColor: colors.sage },
  addBtnText: { fontSize: 14, fontFamily: fonts.bold, color: colors.stoneMid },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow.card,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: colors.stoneMid, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  pressed: { opacity: 0.8 },
  cancelBtn: { backgroundColor: colors.sagePale },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },
  deleteBtn: { backgroundColor: '#C0392B' },
  deleteBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
});
