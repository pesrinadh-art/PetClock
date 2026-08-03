import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-run onboarding flag. The gate (see `OnboardingGate`) routes a brand-new install — no pets
 * AND this flag unset — into `/onboarding`. Once the user finishes (or has ever finished) the flag
 * is set so a later "Reset all data" doesn't drag a returning user back through the intro.
 */
const KEY = 'pawclock:onboarded';

let cache: boolean | null = null;

export async function isOnboardingComplete(): Promise<boolean> {
  if (cache !== null) return cache;
  try {
    cache = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    cache = false;
  }
  return cache;
}

export async function completeOnboarding(): Promise<void> {
  cache = true;
  await AsyncStorage.setItem(KEY, '1');
}

/** Reactive flag for the gate: `{ completed, hydrated }` plus a `complete()` action. */
export function useOnboardingFlag(): { completed: boolean; hydrated: boolean; complete: () => Promise<void> } {
  const [completed, setCompleted] = useState(cache ?? false);
  const [hydrated, setHydrated] = useState(cache !== null);

  useEffect(() => {
    let live = true;
    isOnboardingComplete().then((done) => {
      if (!live) return;
      setCompleted(done);
      setHydrated(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const complete = async () => {
    await completeOnboarding();
    setCompleted(true);
  };

  return { completed, hydrated, complete };
}
