import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandMark } from '../components/BrandMark';
import { router } from 'expo-router';
import { accent, danger, glass, ink, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from '../components/Icon';
import { Card, ListRow, Screen } from '../components/ui';
import { PetWizard } from '../components/PetWizard';
import { completeOnboarding } from '../lib/onboarding';
import { requestNotificationPermission } from '../lib/notifications/permissions';
import { useSession } from '../context/SessionContext';
import { householdErrorMessage } from '../lib/household/invites';

type Step = 'welcome' | 'pet' | 'join' | 'notify';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'drop', title: 'Potty breaks, predicted', body: 'A heads-up before they need to go.' },
  { icon: 'bowl', title: 'Meals on time', body: 'Log breakfast and dinner in one tap.' },
  { icon: 'pill', title: 'Meds and vet visits', body: 'Friendly reminders, so nothing slips.' },
];

/** The brand mark (Liquid Glass Paw logo) with a soft lift off the aurora. */
function AppMark({ size = 52 }: { size?: number }) {
  return (
    <View style={styles.mark}>
      <BrandMark size={size} />
    </View>
  );
}

/** A soft accent tile for a step's line icon (key, bell). */
function StepMark({ icon }: { icon: IconName }) {
  return (
    <View style={styles.stepMark}>
      <Icon name={icon} size={24} color={accent.ink} strokeWidth={1.8} />
    </View>
  );
}

/**
 * First run (Aurora Minimal): welcome → "Welcome a new pet" wizard (About / Routine / Meds) →
 * turn on reminders. Any outcome of the permission prompt finishes onboarding.
 */
export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('welcome');
  const { join } = useSession();
  const [code, setCode] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
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
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <PetWizard closeIcon="chevronLeft" onClose={() => setStep('welcome')} onSaved={() => setStep('notify')} />
      </Screen>
    );
  }

  if (step === 'join') {
    // A second caregiver joins an existing household with its invite code, skipping the
    // "add a pet" wizard — the household they join already has the pets.
    const canJoin = !!code.trim() && !joining;
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.phBar}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => setStep('welcome')}
            role="button"
            aria-label="Back"
            hitSlop={6}
          >
            <Icon name="chevronLeft" size={18} color={ink.primary} strokeWidth={1.8} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <StepMark icon="key" />
          <Text style={styles.headline} role="heading">
            Join a household
          </Text>
          <Text style={styles.lede}>
            Enter the invite code from the person who set up PawClock. You'll share their pets and
            reminders.
          </Text>
          <Text style={styles.fieldLabel}>Invite code</Text>
          <TextInput
            style={[
              styles.codeInput,
              codeFocused && styles.inputFocused,
              joinError ? styles.inputError : null,
            ]}
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
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            onSubmitEditing={() => void submitJoin()}
          />
          {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, !canJoin && styles.disabled, pressed && styles.primaryPressed]}
            onPress={() => void submitJoin()}
            disabled={!canJoin}
            role="button"
            aria-label="Join household"
          >
            {joining ? (
              <ActivityIndicator color={accent.onAccent} />
            ) : (
              <Text style={styles.primaryText}>Join household</Text>
            )}
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (step === 'notify') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={[styles.content, styles.contentTop]}>
          <StepMark icon="bell" />
          <Text style={styles.headline} role="heading">
            Turn on reminders
          </Text>
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
            <Icon name="bell" size={17} color={accent.onAccent} strokeWidth={1.9} />
            <Text style={styles.primaryText}>Turn on reminders</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
            onPress={() => void finish()}
            role="button"
            aria-label="Not now"
          >
            <Text style={styles.mutedLink}>Not now</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, styles.contentTop]}>
        <View style={styles.brandRow}>
          <AppMark />
          <Text style={styles.brand}>PawClock</Text>
        </View>
        <Text style={styles.headline} role="heading">
          Never miss a potty break again
        </Text>
        <Text style={styles.lede}>
          PawClock learns your pet's rhythm and gives you a gentle nudge at just the right time.
        </Text>

        <Card style={styles.features}>
          {FEATURES.map((f, i) => (
            <ListRow
              key={f.title}
              icon={f.icon}
              iconLarge
              title={f.title}
              subtitle={f.body}
              showChevron={false}
              divider={i < FEATURES.length - 1}
            />
          ))}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
          onPress={() => setStep('pet')}
          role="button"
          aria-label="Let's meet your pet"
        >
          <Text style={styles.primaryText}>Let's meet your pet</Text>
          <Icon name="arrowRight" size={17} color={accent.onAccent} strokeWidth={1.9} />
        </Pressable>
        <Text style={styles.caption}>Takes less than a minute</Text>
        <Pressable
          style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
          onPress={() => setStep('join')}
          role="button"
          aria-label="Join a household with an invite code"
        >
          <Text style={styles.joinText}>
            Have an invite code? <Text style={styles.joinStrong}>Join a household</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28 },
  contentTop: { paddingTop: 28 },

  phBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mark: {
    alignSelf: 'flex-start',
    shadowColor: '#1E1E46',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { fontSize: 19, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.6 },
  stepMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderColor: accent.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  headline: {
    fontSize: 24,
    fontFamily: fonts.medium,
    color: ink.primary,
    letterSpacing: -0.85,
    lineHeight: 27,
    marginTop: 22,
  },
  lede: { fontSize: 13.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 21, marginTop: 8 },

  features: { marginTop: 24 },

  footer: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 14, alignItems: 'stretch' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
    shadowColor: accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  primaryPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  primaryText: { fontSize: 15, fontFamily: fonts.medium, color: accent.onAccent },
  caption: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center', marginTop: 10 },
  linkBtn: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  mutedLink: { fontSize: 13.5, fontFamily: fonts.medium, color: ink.muted },
  joinText: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, textAlign: 'center' },
  joinStrong: { fontFamily: fonts.medium, color: accent.ink },
  disabled: { opacity: 0.4 },

  fieldLabel: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 24, marginBottom: 6, marginHorizontal: 2 },
  codeInput: {
    alignSelf: 'stretch',
    minHeight: 54,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.tile,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    fontSize: 19,
    fontFamily: fonts.mono,
    letterSpacing: 3,
    textAlign: 'center',
    color: ink.primary,
  },
  inputFocused: { borderColor: accent.line },
  inputError: { borderColor: danger.primary },
  errorText: { fontSize: 12.5, fontFamily: fonts.regular, color: danger.primary, marginTop: 8, marginHorizontal: 2, lineHeight: 18 },
});
