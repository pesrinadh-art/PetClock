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
import { PetsProvider } from '../context/PetsContext';
import { LogsProvider } from '../context/LogsContext';
import { AppointmentsProvider } from '../context/AppointmentsContext';
import { AutoCalibrator } from '../components/AutoCalibrator';

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
      <PetsProvider>
        <LogsProvider>
          <AppointmentsProvider>
            <AutoCalibrator />
            <PhoneFrame>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="add-appointment" options={{ presentation: 'modal' }} />
                <Stack.Screen name="add-pet" options={{ presentation: 'modal' }} />
              </Stack>
            </PhoneFrame>
          </AppointmentsProvider>
        </LogsProvider>
      </PetsProvider>
    </SafeAreaProvider>
  );
}
