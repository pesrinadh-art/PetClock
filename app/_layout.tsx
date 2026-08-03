import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { colors } from '../theme/colors';
import { SessionProvider } from '../context/SessionContext';
import { PetsProvider } from '../context/PetsContext';
import { LogsProvider } from '../context/LogsContext';
import { AppointmentsProvider } from '../context/AppointmentsContext';
import { NudgesProvider } from '../context/NudgesContext';
import { NotificationPrefsProvider } from '../context/NotificationPrefsContext';
import { AutoCalibrator } from '../components/AutoCalibrator';
import { NotificationObserver } from '../components/NotificationObserver';
import { OnboardingGate } from '../components/OnboardingGate';
import { AppModalHost } from '../components/AppModal';
import { HydrationGate } from '../components/HydrationGate';

// On web, a phone-sized frame makes it possible to sanity-check mobile
// layouts from a normal desktop browser window instead of full-bleed width.
function PhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1a17' }}>
      <View
        style={{
          width: 390,
          height: 844,
          maxHeight: '100%',
          backgroundColor: colors.cream,
          borderRadius: 32,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.4,
          shadowRadius: 60,
          elevation: 20,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    DMMono_500Medium,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* Session/household bootstrap sits ABOVE the data providers: in synced mode it
          resolves auth + household and hot-swaps `repos` before (or shortly after) the
          contexts hydrate; in local mode it is inert. */}
      <SessionProvider>
      <PetsProvider>
        <LogsProvider>
          <AppointmentsProvider>
            <NudgesProvider>
              {/* Under all three data providers: gate the reveal on hydration so
                  the app never flashes empty content before AsyncStorage loads. */}
              <HydrationGate>
                {/* FE-5: persisted quiet-hours / per-pet mute prefs (Settings writes, the
                    NotificationObserver reads). Wraps the observer + navigator so both see it. */}
                <NotificationPrefsProvider>
                <AutoCalibrator />
                {/* Mirrors pets/logs/appointments into scheduled OS notifications (FE-3).
                    Inert on web and without notification permission. */}
                <NotificationObserver />
                {/* FE-5: first-run redirect into /onboarding (no pets + never onboarded). */}
                <OnboardingGate>
                <PhoneFrame>
                  <AppModalHost>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="add-appointment" options={{ presentation: 'modal' }} />
                      <Stack.Screen name="add-pet" options={{ presentation: 'modal' }} />
                      <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
                    </Stack>
                  </AppModalHost>
                </PhoneFrame>
                </OnboardingGate>
                </NotificationPrefsProvider>
              </HydrationGate>
            </NudgesProvider>
          </AppointmentsProvider>
        </LogsProvider>
      </PetsProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
