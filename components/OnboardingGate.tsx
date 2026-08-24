import { useEffect, type ReactNode } from 'react';
import { router, useRootNavigationState, useSegments } from 'expo-router';
import { usePets } from '../context/PetsContext';
import { useSession } from '../context/SessionContext';
import { useOnboardingFlag } from '../lib/onboarding';

/**
 * First-run redirect, in two ordered gates.
 *
 * 1. AUTH (Phase-2, synced mode only). When SessionContext reports `needsAuth` — synced mode
 *    is on, the DEV bypass is off, and there is no verified (non-anonymous) session with a
 *    live household yet — the app is held on `/auth` (mandatory email + 6-digit-code flow).
 *    The tabs never render until an email is verified. In local mode, or under the DEV bypass,
 *    `needsAuth` is always false and this gate is inert.
 *
 * 2. PET SETUP (unchanged FE-5 behaviour). Once past auth, a brand-new install (no pets AND
 *    onboarding never completed) is sent to `/onboarding`. A returning user — or anyone who has
 *    finished onboarding — is left where they are, so a later "Reset all data" never forces the
 *    intro again.
 *
 * Mounted once in `app/_layout.tsx`, under the data providers (so `usePets` is available) and
 * after HydrationGate (so pets are known before we decide).
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { pets, hydrated: petsHydrated } = usePets();
  const { completed, hydrated: flagHydrated } = useOnboardingFlag();
  const { needsAuth, ready } = useSession();
  const navState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    if (!navState?.key) return; // wait for the navigator
    if (!ready) return; // wait for the auth/household bootstrap to settle
    const onAuth = segments[0] === 'auth';

    // Gate 1 — mandatory auth. Hold on /auth until a verified session + household exist.
    if (needsAuth) {
      if (!onAuth) router.replace('/auth');
      return;
    }
    // Verified now but still parked on /auth (the user just typed a correct code): move on.
    // The pet-setup gate below (via /(tabs)) sends brand-new installs into /onboarding.
    if (onAuth) {
      router.replace('/(tabs)');
      return;
    }

    // Gate 2 — first-run pet setup. Needs pets + flag hydrated to decide correctly.
    if (!petsHydrated || !flagHydrated) return;
    const onOnboarding = segments[0] === 'onboarding';
    if (pets.length === 0 && !completed && !onOnboarding) {
      router.replace('/onboarding');
    }
  }, [navState?.key, ready, needsAuth, petsHydrated, flagHydrated, pets.length, completed, segments]);

  return <>{children}</>;
}
