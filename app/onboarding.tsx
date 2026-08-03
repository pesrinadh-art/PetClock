import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { usePets } from '../context/PetsContext';
import { completeOnboarding } from '../lib/onboarding';
import { requestNotificationPermission } from '../lib/notifications/permissions';

const AVATAR_OPTIONS = ['🐶', '🐱', '🐰', '🐹', '🐦', '🐢', '🐍', '🐠'];
const AVATAR_LABELS: Record<string, string> = {
  '🐶': 'Dog',
  '🐱': 'Cat',
  '🐰': 'Rabbit',
  '🐹': 'Hamster',
  '🐦': 'Bird',
  '🐢': 'Turtle',
  '🐍': 'Snake',
  '🐠': 'Fish',
};

type Step = 'welcome' | 'pet' | 'notify';

export default function OnboardingScreen() {
  const { addPet } = usePets();
  const [step, setStep] = useState<Step>('welcome');
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();

  const savePet = () => {
    if (name.trim().length === 0) {
      setNameError('Give your pet a name to continue');
      return;
    }
    // Schedule/holds stay empty on purpose — the pet starts in "calibrating" and the user fills
    // details in via Edit later. This mirrors add-pet's optional-schedule flow.
    addPet({ name: name.trim(), avatarEmoji: avatar, breed: breed.trim() });
    setStep('notify');
  };

  const finish = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  };

  const enableNotifications = async () => {
    // FE-3's primer: ensures channels, requests permission (at most once). Any outcome is fine —
    // the app is fully usable without it — so we finish regardless.
    await requestNotificationPermission();
    await finish();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'welcome' && (
            <View style={styles.stepWrap}>
              <Text style={styles.hero}>🐾</Text>
              <Text style={styles.logo}>
                Paw<Text style={{ color: colors.pooLight }}>Clock</Text>
              </Text>
              <Text style={styles.welcomeBody}>
                Never miss a potty break, meal or med again. PawClock learns your pet's rhythm and
                nudges you at just the right time.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                onPress={() => setStep('pet')}
                role="button"
                aria-label="Get started"
              >
                <Text style={styles.primaryBtnText}>Get Started</Text>
              </Pressable>
            </View>
          )}

          {step === 'pet' && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepKicker}>Step 1 of 2</Text>
              <Text style={styles.stepTitle}>Add your first pet</Text>
              <Text style={styles.stepBody}>You can add more — and fill in feeding times later.</Text>

              <Text style={styles.label}>Species</Text>
              <View style={styles.avatarGrid}>
                {AVATAR_OPTIONS.map((emoji) => {
                  const selected = avatar === emoji;
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => setAvatar(emoji)}
                      role="button"
                      aria-label={AVATAR_LABELS[emoji] ?? 'Pet type'}
                      aria-selected={selected}
                      style={({ pressed }) => [
                        styles.avatarChip,
                        selected && styles.avatarChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={{ fontSize: 26 }}>{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (nameError) setNameError(undefined);
                }}
                placeholder="e.g. Biscuit"
                placeholderTextColor={colors.stoneLight}
                style={[styles.input, name ? styles.inputFilled : null, nameError ? styles.inputError : null]}
              />
              {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

              <Text style={[styles.label, { marginTop: 14 }]}>Breed (optional)</Text>
              <TextInput
                value={breed}
                onChangeText={setBreed}
                placeholder="e.g. Beagle"
                placeholderTextColor={colors.stoneLight}
                style={[styles.input, breed ? styles.inputFilled : null]}
              />

              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                onPress={savePet}
                role="button"
                aria-label="Continue"
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
            </View>
          )}

          {step === 'notify' && (
            <View style={styles.stepWrap}>
              <Text style={styles.hero}>🔔</Text>
              <Text style={styles.stepKicker}>Step 2 of 2</Text>
              <Text style={styles.stepTitle}>Turn on reminders</Text>
              <Text style={styles.stepBody}>
                PawClock's whole point is a tap-to-log nudge at the predicted break time — even with
                the app closed. Allow notifications to get them.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                onPress={() => void enableNotifications()}
                role="button"
                aria-label="Enable reminders"
              >
                <Text style={styles.primaryBtnText}>Enable Reminders</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
                onPress={() => void finish()}
                role="button"
                aria-label="Not now"
              >
                <Text style={styles.skipBtnText}>Not now</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  stepWrap: { gap: 12 },

  hero: { fontSize: 64, textAlign: 'center', marginBottom: 4 },
  logo: { fontSize: 34, fontFamily: fonts.black, color: colors.sage, textAlign: 'center', letterSpacing: -0.5 },
  welcomeBody: { fontSize: 15, color: colors.stoneMid, textAlign: 'center', lineHeight: 22, marginTop: 8, marginBottom: 16 },

  stepKicker: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.sage, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  stepTitle: { fontSize: 24, fontFamily: fonts.black, color: colors.stone, textAlign: 'center' },
  stepBody: { fontSize: 14, color: colors.stoneMid, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  label: { fontSize: 11, fontFamily: fonts.extraBold, textTransform: 'uppercase', letterSpacing: 1, color: colors.stoneMid, marginBottom: 6, marginTop: 6 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6, justifyContent: 'center' },
  avatarChip: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChipSelected: { borderColor: colors.sage, backgroundColor: colors.sagePale },
  input: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.stone,
  },
  inputFilled: { borderColor: colors.sage },
  inputError: { borderColor: '#C0392B' },
  errorText: { fontSize: 12, fontFamily: fonts.semiBold, color: '#C0392B', marginTop: 4 },

  primaryBtn: { backgroundColor: colors.sage, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  primaryBtnText: { color: colors.white, fontSize: 15, fontFamily: fonts.extraBold },
  skipBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  skipBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.stoneMid },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
