import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../components/ui';
import { PetWizard, type WizardStep } from '../components/PetWizard';

const STEPS: WizardStep[] = ['about', 'goals', 'routine', 'meds'];

/**
 * Add / edit a pet — the step wizard ("Welcome a new pet"). `petId` edits that pet; `step`
 * (about | goals | routine | meds) opens straight at that step, e.g. "Edit Mochi's routine".
 */
export default function AddPetScreen() {
  const { petId, step } = useLocalSearchParams<{ petId?: string; step?: string }>();
  const initialStep = STEPS.includes(step as WizardStep) ? (step as WizardStep) : 'about';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <PetWizard petId={petId} initialStep={initialStep} onClose={close} onSaved={close} />
    </Screen>
  );
}
