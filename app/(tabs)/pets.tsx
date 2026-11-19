import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, danger, glass, ink, radius, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../../components/Icon';
import { Card, HeroCard, Screen, SectionLabel, TAB_BAR_CLEARANCE, type Stat } from '../../components/ui';
import { TopNavBar } from '../../components/TopNavBar';
import { PetListItem } from '../../components/PetListItem';
import { PetAvatar } from '../../components/PetAvatar';
import { joinPetNames } from '../../lib/petNames';
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

  // The tab bar's centre button is quick-log now, so the Pets tab owns "Add a pet".
  const addPet = () => router.push('/add-pet');

  // Household summary for the hero — sums across every pet.
  const logsToday = pets.reduce((sum, p) => sum + countLogsToday(getLogsForPet(p.id), now), 0);
  const medsCount = pets.reduce((sum, p) => sum + getMedicationsForPet(p.id).filter((m) => m.active).length, 0);
  const stats: Stat[] = [
    { value: String(pets.length), label: pets.length === 1 ? 'Pet' : 'Pets' },
    { value: pets.length > 0 ? String(logsToday) : '—', label: 'Logs today' },
    { value: medsCount > 0 ? String(medsCount) : '—', label: 'Daily meds' },
  ];
  const heroSub =
    pets.length === 0
      ? 'Add your first pet to get started.'
      : logsToday === 0
        ? 'Nothing logged yet today.'
        : `${logsToday} ${logsToday === 1 ? 'moment' : 'moments'} logged today. Lovely work.`;

  return (
    <Screen edges={['top']}>
      <TopNavBar eyebrow="Family" title="Your pets" action={{ icon: 'plus', label: 'Add a pet', onPress: addPet }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <HeroCard
          eyebrow={`${pets.length} in your care`}
          title={pets.length > 0 ? joinPetNames(pets.map((p) => p.name)) : 'No pets yet'}
          subtitle={heroSub}
          stats={stats}
        >
          {pets.length > 0 && (
            <View style={styles.stack}>
              {pets.slice(0, 5).map((p, i) => (
                <PetAvatar
                  key={p.id}
                  pet={p}
                  size={34}
                  emojiSize={17}
                  style={[styles.stackAvatar, i > 0 && { marginLeft: -8 }]}
                />
              ))}
            </View>
          )}
        </HeroCard>

        <View style={styles.section}>
          <SectionLabel sub="Tap a pet to open their profile.">Your family</SectionLabel>
          {pets.length > 0 && (
            <Card>
              {pets.map((pet, i) => (
                <PetListItem
                  key={pet.id}
                  pet={pet}
                  onDelete={() => setPendingDelete(pet)}
                  divider={i < pets.length - 1}
                />
              ))}
            </Card>
          )}

          <Pressable
            style={({ pressed }) => [styles.addCard, pressed && styles.addPressed]}
            onPress={addPet}
            role="button"
            aria-label="Add a pet"
          >
            <View style={styles.addIcon}>
              <Icon name="plus" size={18} color={accent.ink} strokeWidth={1.9} />
            </View>
            <Text style={styles.addTitle}>Add a pet</Text>
            <Text style={styles.addBody}>About, routine and meds, in three short steps.</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: TAB_BAR_CLEARANCE },
  section: { marginTop: 24 },
  stack: { flexDirection: 'row', marginTop: 14 },
  stackAvatar: { backgroundColor: accent.soft, borderWidth: 2, borderColor: surface.solid },


  // "Add a pet" glass card (design `.card.glass.ev-add`).
  addCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: surface.card,
    ...shadow.card,
  },
  addPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  addTitle: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.25, marginBottom: 4 },
  addBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, lineHeight: 19 },

  // TODO(FE-5): move to Settings — styling for the temporary demo/reset affordance.
  demoBox: { marginTop: 24, alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  demoText: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center', lineHeight: 19 },
  demoBtn: {
    backgroundColor: accent.primary,
    borderRadius: radius.pill,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    ...shadow.fab,
  },
  demoBtnText: { color: accent.onAccent, fontSize: 14, fontFamily: fonts.medium },
  resetLink: { paddingVertical: 6, paddingHorizontal: 8 },
  resetLinkText: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted },

  overlay: {
    flex: 1,
    backgroundColor: glass.scrimDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: surface.solid,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.border,
    padding: 20,
    ...shadow.hero,
  },
  dialogTitle: { fontSize: 17, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.35, marginBottom: 8 },
  dialogBody: { fontSize: 13.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 20, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 8 },
  dialogBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  cancelBtn: { backgroundColor: glass.strong, borderWidth: 1, borderColor: glass.border2 },
  cancelBtnText: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  deleteBtn: { backgroundColor: danger.primary },
  deleteBtnText: { fontSize: 14, fontFamily: fonts.medium, color: ink.onDark },
});
