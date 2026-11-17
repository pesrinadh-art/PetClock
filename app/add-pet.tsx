import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { surface } from '../theme/colors';
import { PetWizard, type WizardStep } from '../components/PetWizard';

const STEPS: WizardStep[] = ['about', 'routine', 'meds'];

/**
 * Add / edit a pet — the 3-step wizard ("Welcome a new pet"). `petId` edits that pet; `step`
 * (about | routine | meds) opens straight at that step, e.g. "Edit Mochi's routine".
 */
export default function AddPetScreen() {
  const { petId, step } = useLocalSearchParams<{ petId?: string; step?: string }>();
  const initialStep = STEPS.includes(step as WizardStep) ? (step as WizardStep) : 'about';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <SafeAreaView style={styles.safe}>
      <PetWizard petId={petId} initialStep={initialStep} onClose={close} onSaved={close} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
});
