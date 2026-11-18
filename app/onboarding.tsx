import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { category, green, ink, line, logTint, radius, shadow, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from '../components/Icon';
import { PetWizard } from '../components/PetWizard';
import { completeOnboarding } from '../lib/onboarding';
import { requestNotificationPermission } from '../lib/notifications/permissions';
import { useSession } from '../context/SessionContext';
import { householdErrorMessage } from '../lib/household/invites';

type Step = 'welcome' | 'pet' | 'join' | 'notify';

const FEATURES: { icon: IconName; bg: string; fg: string; title: string; body: string }[] = [
  { icon: 'drop', bg: logTint.peeBg, fg: logTint.peeInk, title: 'Potty breaks, predicted', body: 'A heads-up before they need to go.' },
  { icon: 'bowl', bg: terracotta.tint, fg: terracotta.primary, title: 'Meals on time', body: 'Log breakfast and dinner in one tap.' },
  { icon: 'pill', bg: category.medBg, fg: category.medInk, title: 'Meds and vet visits', body: 'Friendly reminders, so nothing slips.' },
];

/** The green rounded-square app mark with a paw. */
function AppMark({ size = 88 }: { size?: number }) {
  return (
    <LinearGradient
      colors={[green.gradientFrom, green.gradientTo]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.mark, { width: size, height: size, borderRadius: size * 0.27 }]}
    >
      <Icon name="paw" size={size * 0.5} color="#ffffff" strokeWidth={1.9} />
    </LinearGradient>
  );
}

/**
 * First run (redesign v3): welcome → "Welcome a new pet" wizard (About / Routine / Meds) →
 * turn on reminders. Any outcome of the permission prompt finishes onboarding.
 */
export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('welcome');
  const { join } = useSession();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const submitJoin = async () => {
    if (!code.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      await join(code.trim());
      setStep('notify');
    } catch (e) {
      setJoinError(householdErrorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  const finish = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  };

  const enableNotifications = async () => {
    // Ensures channels, requests permission (at most once). The app is fully usable without it.
    await requestNotificationPermission();
    await finish();
  };

  if (step === 'pet') {
    return (
      <SafeAreaView style={styles.safe}>
        <PetWizard closeIcon="chevronLeft" onClose={() => setStep('welcome')} onSaved={() => setStep('notify')} />
      </SafeAreaView>
    );
  }

  if (step === 'join') {
    // A second caregiver joins an existing household with its invite code, skipping the
    // "add a pet" wizard — the household they join already has the pets.
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.bellCircle}>
            <Icon name="key" size={38} color={green.primary} strokeWidth={1.8} />
          </View>
          <Text style={styles.headline}>Join a household</Text>
          <Text style={styles.lede}>
            Enter the invite code from the person who set up PawClock. You'll share their pets and
            reminders.
          </Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              setJoinError(null);
            }}
            placeholder="ABC123"
            placeholderTextColor={ink.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={12}
            accessibilityLabel="Invite code"
            onSubmitEditing={() => void submitJoin()}
          />
          {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!code.trim() || joining) && styles.disabled,
              pressed && styles.primaryPressed,
            ]}
            onPress={() => void submitJoin()}
            disabled={!code.trim() || joining}
            role="button"
            aria-label="Join household"
          >
            {joining ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Join household</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
            onPress={() => setStep('welcome')}
            role="button"
            aria-label="Back"
          >
            <Text style={styles.skipText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'notify') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.center}>
          <View style={styles.bellCircle}>
            <Icon name="bell" size={40} color={green.primary} strokeWidth={1.8} />
          </View>
          <Text style={styles.headline}>Turn on reminders</Text>
          <Text style={styles.lede}>
            PawClock's whole point is a tap-to-log nudge at the predicted break time — even with the app
            closed. Allow notifications to get them.
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
            onPress={() => void enableNotifications()}
            role="button"
            aria-label="Turn on reminders"
          >
            <Icon name="bell" size={18} color="#ffffff" strokeWidth={2.2} />
            <Text style={styles.primaryText}>Turn on reminders</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]} onPress={() => void finish()} role="button" aria-label="Not now">
            <Text style={styles.skipText}>Not now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.center}>
        <AppMark />
        <Text style={styles.brand}>PawClock</Text>
        <Text style={styles.headline}>Never miss a potty break again</Text>
        <Text style={styles.lede}>PawClock learns your pet's rhythm and gives you a gentle nudge at just the right time.</Text>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={f.title} style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureDivider]}>
              <View style={[styles.featureIcon, { backgroundColor: f.bg }]}>
                <Icon name={f.icon} size={20} color={f.fg} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
          onPress={() => setStep('pet')}
          role="button"
          aria-label="Let's meet your pet"
        >
          <Text style={styles.primaryText}>Let's meet your pet</Text>
          <Icon name="arrowRight" size={18} color="#ffffff" strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.caption}>Takes less than a minute</Text>
        <Pressable
          style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
          onPress={() => setStep('join')}
          role="button"
          aria-label="Join a household with an invite code"
        >
          <Text style={styles.joinText}>
            Have an invite code? <Text style={styles.joinStrong}>Join a household</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  pressed: { opacity: 0.7 },

  mark: { alignItems: 'center', justifyContent: 'center', ...shadow.hero },
  brand: { fontSize: 17, fontFamily: fonts.extraBold, color: green.primary, marginTop: 12 },
  headline: {
    fontSize: 30,
    fontFamily: fonts.extraBold,
    color: ink.primary,
    letterSpacing: -0.9,
    textAlign: 'center',
    lineHeight: 34,
    marginTop: 26,
  },
  lede: { fontSize: 15, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center', lineHeight: 22, marginTop: 10 },

  features: {
    alignSelf: 'stretch',
    marginTop: 26,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: surface.card,
    ...shadow.card,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: line.hairline },
  featureIcon: { width: 44, height: 44, borderRadius: radius.iconTile, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 15, fontFamily: fonts.bold, color: ink.primary },
  featureBody: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },

  bellCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: line.border,
    alignItems: 'stretch',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    borderRadius: radius.card,
    backgroundColor: green.mid,
    ...shadow.fab,
  },
  primaryPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  primaryText: { fontSize: 16, fontFamily: fonts.bold, color: '#ffffff' },
  caption: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center', marginTop: 10 },
  skipBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  skipText: { fontSize: 14, fontFamily: fonts.bold, color: ink.muted },
  joinText: { fontSize: 14, fontFamily: fonts.medium, color: ink.muted, textAlign: 'center' },
  joinStrong: { fontFamily: fonts.bold, color: green.primary },
  disabled: { opacity: 0.5 },
  codeInput: {
    alignSelf: 'stretch',
    marginTop: 26,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: line.border,
    fontSize: 22,
    fontFamily: fonts.extraBold,
    letterSpacing: 4,
    textAlign: 'center',
    color: ink.primary,
    ...shadow.card,
  },
  errorText: { fontSize: 13.5, fontFamily: fonts.semiBold, color: terracotta.ink, textAlign: 'center', marginTop: 12 },
});
