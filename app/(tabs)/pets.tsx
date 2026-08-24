import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface, green, ink, line, radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../../components/Icon';
import { HeroCard, SectionLabel, type Stat } from '../../components/ui';
import { TopNavBar } from '../../components/TopNavBar';
import { PetListItem } from '../../components/PetListItem';
import { AppModal } from '../../components/AppModal';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useDeletePetCascade } from '../../hooks/useDeletePetCascade';
import { countLogsToday } from '../../lib/petSchedule';
import { useNow } from '../../hooks/useNow';
// TODO(FE-5): move to Settings — the demo-data / reset escape hatch lives here
// temporarily on the empty Pets tab until the Settings screen (FE-5) exists.
import { loadDemoData, resetAll } from '../../lib/repo/types';
import type { Pet } from '../../data/mockData';

export default function PetsScreen() {
  const { pets, getMedicationsForPet } = usePets();
  const { getLogsForPet } = useLogs();
  const deletePetCascade = useDeletePetCascade();
  const now = useNow();
  const [pendingDelete, setPendingDelete] = useState<Pet | null>(null);
  const [blockedMessage, setBlockedMessage] = useState(false);
  // TODO(FE-5): move to Settings.
  const [confirmReset, setConfirmReset] = useState(false);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    // Cascades: also deletes the pet's logs and detaches it from appointments (D10).
    const ok = deletePetCascade(pendingDelete.id);
    setPendingDelete(null);
    if (!ok) setBlockedMessage(true);
  };

  // Household summary for the hero — sums across every pet.
  const logsToday = pets.reduce((sum, p) => sum + countLogsToday(getLogsForPet(p.id), now), 0);
  const medsCount = pets.reduce((sum, p) => sum + getMedicationsForPet(p.id).filter((m) => m.active).length, 0);
  const stats: Stat[] = [
    { value: String(pets.length), label: 'Pets' },
    { value: pets.length > 0 ? String(logsToday) : '—', label: 'Logs today' },
    { value: medsCount > 0 ? String(medsCount) : '—', label: 'Meds' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          eyebrow="PawClock"
          title="Your pets"
          stats={stats}
        />

        <View style={styles.section}>
          <SectionLabel>In your care</SectionLabel>
          {pets.map((pet) => (
            <PetListItem key={pet.id} pet={pet} onDelete={() => setPendingDelete(pet)} />
          ))}

          <Pressable
            style={({ pressed }) => [styles.dashed, pressed && styles.dashedPressed]}
            onPress={() => router.push('/add-pet')}
            role="button"
            aria-label="Add pet"
          >
            <Icon name="plus" size={15} color={ink.muted} strokeWidth={2.2} />
            <Text style={styles.dashedText}>Add pet</Text>
          </Pressable>
        </View>

        {/* TODO(FE-5): move to Settings — temporary demo-data escape hatch shown
            only when there are no pets (a fresh install starts empty). */}
        {pets.length === 0 && (
          <View style={styles.demoBox}>
            <Text style={styles.demoText}>
              Just exploring? Load sample pets, logs and appointments to try PawClock out.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.demoBtn, pressed && styles.pressed]}
              onPress={() => void loadDemoData()}
              role="button"
              aria-label="Load demo data"
            >
              <Text style={styles.demoBtnText}>Load demo data</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.resetLink, pressed && styles.pressed]}
              onPress={() => setConfirmReset(true)}
              role="button"
              aria-label="Reset all data"
            >
              <Text style={styles.resetLinkText}>Reset all data</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <AppModal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
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
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.pressed]}
                onPress={confirmDelete}
                role="button"
                aria-label={`Remove ${pendingDelete?.name}`}
              >
                <Text style={styles.deleteBtnText}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* TODO(FE-5): move to Settings — destructive reset confirm (reuses AppModal). */}
      <AppModal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmReset(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Reset all data?</Text>
            <Text style={styles.dialogBody}>
              This clears every pet, log and appointment on this device. This can't be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setConfirmReset(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.pressed]}
                onPress={() => {
                  setConfirmReset(false);
                  void resetAll();
                }}
                role="button"
                aria-label="Reset all data"
              >
                <Text style={styles.deleteBtnText}>Reset</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>

      <AppModal visible={blockedMessage} transparent animationType="fade" onRequestClose={() => setBlockedMessage(false)}>
        <Pressable style={styles.overlay} onPress={() => setBlockedMessage(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Can't remove your last pet</Text>
            <Text style={styles.dialogBody}>PawClock needs at least one pet. Add another before removing this one.</Text>
            <Pressable
              style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed, { marginTop: 4 }]}
              onPress={() => setBlockedMessage(false)}
              role="button"
              aria-label="Got it"
            >
              <Text style={styles.cancelBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  section: { marginTop: 18 },
  dashed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 2,
    paddingVertical: 13,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },
  dashedPressed: { opacity: 0.6 },
  dashedText: { fontSize: 12.5, fontFamily: fonts.semiBold, color: ink.muted },

  // TODO(FE-5): move to Settings — styling for the temporary demo/reset affordance.
  demoBox: { marginTop: 24, alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  demoText: { fontSize: 13, color: ink.muted, textAlign: 'center', lineHeight: 19 },
  demoBtn: {
    backgroundColor: green.mid,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  demoBtnText: { color: ink.onDark, fontSize: 14, fontFamily: fonts.extraBold },
  resetLink: { paddingVertical: 6, paddingHorizontal: 8 },
  resetLinkText: { fontSize: 12, fontFamily: fonts.bold, color: ink.faint },

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
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: 20,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  pressed: { opacity: 0.8 },
  cancelBtn: { backgroundColor: green.tint },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: green.primary },
  deleteBtn: { backgroundColor: '#C0392B' },
  deleteBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: ink.onDark },
});
