import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { colors } from '../theme/colors';
import { usePets } from '../context/PetsContext';
import { useLogs } from '../context/LogsContext';
import { useAppointments } from '../context/AppointmentsContext';
import { hideSplash } from '../lib/splash';

/**
 * Holds the reveal until all three persisted collections have loaded from
 * AsyncStorage, so the app never flashes an empty state before hydration
 * completes. Reads the `hydrated` flag each data context exposes; once all
 * three are true it hides the native splash (kept up by lib/splash.ts's
 * preventAutoHideAsync at boot) and renders its children.
 *
 * MUST be mounted UNDER PetsProvider, LogsProvider and AppointmentsProvider so
 * it can read their hydrated flags. Until ready it renders nothing on native
 * (the native splash stays visible); on web there is no native splash, so it
 * shows a full-screen placeholder matching the colors.background blank the root
 * layout paints while fonts load.
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const petsHydrated = usePets().hydrated;
  const logsHydrated = useLogs().hydrated;
  const apptsHydrated = useAppointments().hydrated;
  const ready = petsHydrated && logsHydrated && apptsHydrated;

  useEffect(() => {
    if (ready) void hideSplash();
  }, [ready]);

  if (!ready) {
    // Native: keep the splash up (render nothing). Web: match the font-load blank.
    return Platform.OS === 'web' ? (
      <View style={{ flex: 1, backgroundColor: colors.background }} />
    ) : null;
  }

  return <>{children}</>;
}
