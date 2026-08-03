import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { TimePickerField } from '../components/TimePickerField';
import { usePets } from '../context/PetsContext';
import { BreedAutocomplete } from '../components/BreedAutocomplete';
import { completeOnboarding } from '../lib/onboarding';
import { requestNotificationPermission } from '../lib/notifications/permissions';
import { to24h } from '../lib/petFormTime';

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

type FeedRow = { rowId: string; time: string };
type MedRow = { rowId: string; name: string; time: string };

const MAX_FEED_TIMES = 6;
const MAX_MEDICATIONS = 5;

function makeRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function OnboardingScreen() {
  const { addPet } = usePets();
  const [step, setStep] = useState<Step>('welcome');
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  // Optional schedule capture — mirrors add-pet's feedRows/medications, kept compact for
  // onboarding: both lists start empty and the user taps "Add" to reveal a row.
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [medications, setMedications] = useState<MedRow[]>([]);

  const addFeedRow = () => {
    setFeedRows((prev) => (prev.length >= MAX_FEED_TIMES ? prev : [...prev, { rowId: makeRowId(), time: '' }]));
  };
  const updateFeedRow = (rowId: string, time: string) => {
    setFeedRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, time } : r)));
  };
  const removeFeedRow = (rowId: string) => {
    setFeedRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const addMedicationRow = () => {
    setMedications((prev) =>
      prev.length >= MAX_MEDICATIONS ? prev : [...prev, { rowId: makeRowId(), name: '', time: '' }],
    );
  };
  const updateMedicationRow = (rowId: string, field: 'name' | 'time', value: string) => {
    setMedications((prev) => prev.map((m) => (m.rowId === rowId ? { ...m, [field]: value } : m)));
  };
  const removeMedicationRow = (rowId: string) => {
    setMedications((prev) => prev.filter((m) => m.rowId !== rowId));
  };

  const savePet = () => {
    if (name.trim().length === 0) {
      setNameError('Give your pet a name to continue');
      return;
    }
    // Convert the picker's "h:mm AM/PM" to storage "HH:MM" and drop blank rows — a blank time
    // would reach the feed/med RPCs as "" and Postgres rejects it (22007). Empty overall is fine.
    const feedTimes = feedRows.map((r) => to24h(r.time.trim())).filter(Boolean);
    const meds = medications
      .map((m) => ({ name: m.name.trim(), localTime: to24h(m.time.trim()) }))
      .filter((m) => m.name && m.localTime);
    // Holds stay null — the pet starts "calibrating" and the user can tune them via Edit later.
    addPet({ name: name.trim(), avatarEmoji: avatar, breed: breed.trim(), feedTimes, medications: meds });
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
              <BreedAutocomplete
                value={breed}
                onChange={setBreed}
                placeholder="e.g. Beagle"
                species={AVATAR_LABELS[avatar]}
              />

              <Text style={[styles.label, { marginTop: 14 }]}>Feed times (optional)</Text>
              {feedRows.map((row, i) => (
                <View key={row.rowId} style={styles.scheduleRow}>
                  <TimePickerField
                    value={row.time}
                    onChange={(v) => updateFeedRow(row.rowId, v)}
                    placeholder={`Feed time ${i + 1}`}
                    style={styles.rowFlex}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    onPress={() => removeFeedRow(row.rowId)}
                    role="button"
                    aria-label={`Remove feed time ${i + 1}`}
                    hitSlop={8}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {feedRows.length < MAX_FEED_TIMES && (
                <Pressable
                  style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                  onPress={addFeedRow}
                  role="button"
                  aria-label="Add feed time"
                >
                  <Text style={styles.addBtnText}>➕ Add feed time</Text>
                </Pressable>
              )}

              <Text style={[styles.label, { marginTop: 14 }]}>Medications (optional)</Text>
              {medications.map((med) => (
                <View key={med.rowId} style={styles.scheduleRow}>
                  <TextInput
                    value={med.name}
                    onChangeText={(v) => updateMedicationRow(med.rowId, 'name', v)}
                    placeholder="Medicine name"
                    placeholderTextColor={colors.stoneLight}
                    style={[styles.input, styles.medNameInput, med.name ? styles.inputFilled : null]}
                  />
                  <TimePickerField
                    value={med.time}
                    onChange={(v) => updateMedicationRow(med.rowId, 'time', v)}
                    placeholder="Time"
                    style={styles.medTimeInput}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    onPress={() => removeMedicationRow(med.rowId)}
                    role="button"
                    aria-label={med.name.trim() ? `Remove ${med.name.trim()}` : 'Remove medication'}
                    hitSlop={8}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {medications.length < MAX_MEDICATIONS && (
                <Pressable
                  style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                  onPress={addMedicationRow}
                  role="button"
                  aria-label="Add medication"
                >
                  <Text style={styles.addBtnText}>➕ Add medication</Text>
                </Pressable>
              )}

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

  scheduleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  rowFlex: { flex: 1 },
  medNameInput: { flex: 1.4 },
  medTimeInput: { flex: 1 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDECEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: '#C0392B' },
  addBtn: {
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.stoneMid },

  primaryBtn: { backgroundColor: colors.sage, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  primaryBtnText: { color: colors.white, fontSize: 15, fontFamily: fonts.extraBold },
  skipBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  skipBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.stoneMid },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
