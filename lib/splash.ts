import * as SplashScreen from 'expo-splash-screen';

// Keep the native splash visible past its auto-hide so a later wave can gate the
// reveal on data hydration (fonts + all repos) and call `hideSplash()` itself.
//
// Expo requires `preventAutoHideAsync()` to run in module (global) scope, before
// React mounts and without awaiting — so this file is imported purely for its
// side effect by the repos module (`lib/repo/types.ts`), which every context
// pulls in at boot. On web / when the splash is already gone this is a no-op.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* nothing to prevent (web, or splash already hidden) */
});

/**
 * Hide the native splash. Wave 3 wires this into `app/_layout.tsx` once
 * `fontsLoaded && petsHydrated && logsHydrated && apptsHydrated`.
 */
export function hideSplash(): Promise<void> {
  return SplashScreen.hideAsync().catch(() => {
    /* already hidden */
  });
}
