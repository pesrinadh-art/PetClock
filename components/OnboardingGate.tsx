import { useEffect, type ReactNode } from 'react';
import { router, useRootNavigationState, useSegments } from 'expo-router';
import { usePets } from '../context/PetsContext';
import { useOnboardingFlag } from '../lib/onboarding';

/**
 * First-run redirect. Renders its children untouched and, once the root navigator is mounted and
 * both pets + the onboarding flag have hydrated, sends a brand-new install (no pets AND onboarding
 * never completed) to `/onboarding`. A returning user — or anyone who has finished onboarding —
 * is left where they are, so a later "Reset all data" never forces the intro again.
 *
 * Mounted once in `app/_layout.tsx` (sibling of NotificationObserver), under the data providers
 * so `usePets` is available and after HydrationGate so pets are known before we decide.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { pets, hydrated: petsHydrated } = usePets();
  const { completed, hydrated: flagHydrated } = useOnboardingFlag();
  const navState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    if (!navState?.key) return; // wait for the navigator
    if (!petsHydrated || !flagHydrated) return; // wait for data
    const onOnboarding = segments[0] === 'onboarding';
    if (pets.length === 0 && !completed && !onOnboarding) {
      router.replace('/onboarding');
    }
  }, [navState?.key, petsHydrated, flagHydrated, pets.length, completed, segments]);

  return <>{children}</>;
}
