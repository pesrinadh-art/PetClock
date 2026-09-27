import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ink, space } from '../../theme/colors';
import { type } from '../../theme/fonts';
import {
  Button,
  HeroCard,
  PetEmptyState,
  Screen,
  SectionLabel,
  type Stat,
} from '../../components/ui';
import { TopNavBar } from '../../components/TopNavBar';
import { PetListItem } from '../../components/PetListItem';
import { PetAvatar } from '../../components/PetAvatar';
import { ConfirmDialog } from '../../components/pets/ConfirmDialog';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { useDeletePetCascade } from '../../hooks/useDeletePetCascade';
import { countLogsToday } from '../../lib/petSchedule';
import { useNow } from '../../hooks/useNow';
import { joinNames, possessive } from '../../lib/petVoice';
// TODO(FE-5): move to Settings — the demo-data / reset escape hatch lives here
// temporarily on the empty Pets tab until the Settings screen (FE-5) exists.
import { loadDemoData, resetAll } from '../../lib/repo/types';
import type { Pet } from '../../data/mockData';

/** How many faces to stack in the hero before collapsing into "+N". */
const MAX_STACKED = 4;

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

  const addPet = () => router.push('/add-pet');

  // Household summary for the hero — sums across every pet.
  const logsToday = pets.reduce((sum, p) => sum + countLogsToday(getLogsForPet(p.id), now), 0);
  const medsCount = pets.reduce((sum, p) => sum + getMedicationsForPet(p.id).filter((m) => m.active).length, 0);
  const stats: Stat[] = [
    { value: String(pets.length), label: pets.length === 1 ? 'Pet' : 'Pets' },
    { value: pets.length > 0 ? String(logsToday) : '—', label: 'Logs today' },
    { value: medsCount > 0 ? String(medsCount) : '—', label: 'Daily meds' },
  ];

  const names = joinNames(pets.map((p) => p.name));
  const stacked = pets.slice(0, MAX_STACKED);
  const extra = pets.length - stacked.length;
  const heroSubtitle =
    logsToday > 0
      ? `${logsToday} ${logsToday === 1 ? 'moment' : 'moments'} logged today. Lovely work.`
      : 'Tap a pet to see their meals, meds and diary.';

  return (
    <Screen header={<TopNavBar title="Your pets" eyebrow={pets.length > 0 ? 'Family' : undefined} />} tabBar>
      {pets.length === 0 ? (
        <>
          <PetEmptyState
            title="Let's meet your pet"
            body="Add your first pet and we'll help you keep track of their day."
            icon="paw"
            tone="pet"
            action={{ label: 'Add your first pet', icon: 'plus', onPress: addPet }}
            style={styles.emptyState}
          />

          {/* TODO(FE-5): move to Settings — temporary demo-data escape hatch shown
              only when there are no pets (a fresh install starts empty). */}
          <View style={styles.demoBox}>
            <Text style={styles.demoText}>
              Just exploring? Load sample pets, logs and visits to try PawClock out.
            </Text>
            <Button
              label="Load demo data"
              variant="secondary"
              size="md"
              icon="sparkle"
              onPress={() => void loadDemoData()}
              style={styles.center}
            />
            <Button
              label="Reset all data"
              variant="ghost"
              tone="neutral"
              size="md"
              onPress={() => setConfirmReset(true)}
              style={styles.center}
            />
          </View>
        </>
      ) : (
        <>
          <HeroCard
            eyebrow={pets.length === 1 ? 'In your care' : `${pets.length} in your care`}
            title={names}
            subtitle={heroSubtitle}
            stats={stats}
          >
            <View style={styles.faces} aria-label={`Photos of ${names}`}>
              {stacked.map((pet, i) => (
                <View key={pet.id} style={[styles.face, i > 0 && styles.faceOverlap]}>
                  <PetAvatar pet={pet} size={40} ring="onDark" />
                </View>
              ))}
              {extra > 0 ? (
                <View style={[styles.face, styles.faceOverlap, styles.more]}>
                  <Text style={styles.moreText}>+{extra}</Text>
                </View>
              ) : null}
            </View>
          </HeroCard>

          <View style={styles.section}>
            <SectionLabel hint="Tap a pet to open their profile.">
              Your family
            </SectionLabel>
            {pets.map((pet) => (
              <PetListItem key={pet.id} pet={pet} onDelete={() => setPendingDelete(pet)} />
            ))}

            <Button
              label={pets.length === 1 ? 'Add another pet' : 'Add a pet'}
              icon="plus"
              variant="secondary"
              fullWidth
              onPress={addPet}
              style={styles.addBtn}
            />
          </View>
        </>
      )}

      <ConfirmDialog
        visible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        leading={pendingDelete ? <PetAvatar pet={pendingDelete} size={64} ring /> : undefined}
        title={`Remove ${pendingDelete?.name ?? 'this pet'}?`}
        body={`This deletes ${possessive(pendingDelete?.name)} profile and diary. It can't be undone.`}
        confirm={{
          label: `Remove ${pendingDelete?.name ?? 'pet'}`,
          icon: 'trash',
          tone: 'neutral',
          onPress: confirmDelete,
        }}
        cancel={{ label: `Keep ${pendingDelete?.name ?? 'pet'}` }}
      />

      {/* TODO(FE-5): move to Settings — destructive reset confirm. */}
      <ConfirmDialog
        visible={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all data?"
        body="This clears every pet, log and visit on this device. It can't be undone."
        cancel={{ label: 'Keep my data' }}
        confirm={{
          label: 'Reset everything',
          tone: 'neutral',
          accessibilityLabel: 'Reset all data',
          onPress: () => {
            setConfirmReset(false);
            void resetAll();
          },
        }}
      />

      <ConfirmDialog
        visible={blockedMessage}
        onClose={() => setBlockedMessage(false)}
        title="Your last pet stays"
        body="PawClock needs at least one pet. Add another before removing this one."
        cancel={{ label: 'Got it' }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyState: { paddingTop: space.xxl * 2 },
  center: { alignSelf: 'center' },
  demoBox: { marginTop: space.xs, alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  demoText: { ...type.bodySm, color: ink.muted, textAlign: 'center', marginBottom: space.xxs },

  faces: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  face: { borderRadius: 999 },
  faceOverlap: { marginLeft: -10 },
  more: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { ...type.caption, color: ink.onDark },

  section: { marginTop: space.section },
  addBtn: { marginTop: space.xxs },
});
