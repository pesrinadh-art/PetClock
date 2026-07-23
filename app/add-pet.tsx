import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { SectionTitle } from '../components/SectionTitle';
import { TimePickerField } from '../components/TimePickerField';
import { usePets } from '../context/PetsContext';

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
const MAX_MEDICATIONS = 5;
const MAX_FEED_TIMES = 6;
const HOLD_HOURS_MIN = 0.5;
const HOLD_HOURS_MAX = 24;

type MedRow = { rowId: string; name: string; time: string };
type FeedRow = { rowId: string; time: string };
type FormErrors = { name?: string; feedTimes?: string; peeHoldHours?: string; poopHoldHours?: string };

function makeRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Required — must be numeric, clamped to 0.5–24. Empty blocks save so the schedule is never left to guess. */
function parseHoldHours(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, error: 'Required — enter hours' };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: null, error: `Enter a number between ${HOLD_HOURS_MIN} and ${HOLD_HOURS_MAX}` };
  }
  return { value: Math.min(HOLD_HOURS_MAX, Math.max(HOLD_HOURS_MIN, parsed)) };
}

export default function AddPetScreen() {
  const { pets, addPet, updatePet } = usePets();
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const editingPet = petId ? pets.find((p) => p.id === petId) : undefined;
  const isEditing = !!editingPet;

  const [avatar, setAvatar] = useState(editingPet?.avatar ?? AVATAR_OPTIONS[0]);
  const [name, setName] = useState(editingPet?.name ?? '');
  const [breed, setBreed] = useState(editingPet?.breed ?? '');
  const [age, setAge] = useState(editingPet?.age ?? '');
  const [feedRows, setFeedRows] = useState<FeedRow[]>(() => {
    const existing = editingPet?.feedTimes ?? [];
    const rows = existing.map((time) => ({ rowId: makeRowId(), time }));
    return rows.length > 0 ? rows : [{ rowId: makeRowId(), time: '' }, { rowId: makeRowId(), time: '' }];
  });
  const [peeHoldHours, setPeeHoldHours] = useState(editingPet?.peeHoldHours?.toString() ?? '');
  const [poopHoldHours, setPoopHoldHours] = useState(editingPet?.poopHoldHours?.toString() ?? '');
  const [medications, setMedications] = useState<MedRow[]>(
    () => editingPet?.medications.map((m) => ({ rowId: m.id, name: m.name, time: m.time })) ?? []
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const clearError = (field: keyof FormErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const addFeedRow = () => {
    setFeedRows((prev) => (prev.length >= MAX_FEED_TIMES ? prev : [...prev, { rowId: makeRowId(), time: '' }]));
  };

  const updateFeedRow = (rowId: string, time: string) => {
    setFeedRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, time } : r)));
    clearError('feedTimes');
  };

  const removeFeedRow = (rowId: string) => {
    setFeedRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const addMedicationRow = () => {
    setMedications((prev) => (prev.length >= MAX_MEDICATIONS ? prev : [...prev, { rowId: makeRowId(), name: '', time: '' }]));
  };

  const updateMedicationRow = (rowId: string, field: 'name' | 'time', value: string) => {
    setMedications((prev) => prev.map((m) => (m.rowId === rowId ? { ...m, [field]: value } : m)));
  };

  const removeMedicationRow = (rowId: string) => {
    setMedications((prev) => prev.filter((m) => m.rowId !== rowId));
  };

  const handleSave = () => {
    const pee = parseHoldHours(peeHoldHours);
    const poop = parseHoldHours(poopHoldHours);
    const feedTimes = feedRows.map((r) => r.time.trim()).filter(Boolean);
    const nextErrors: FormErrors = {};
    if (name.trim().length === 0) nextErrors.name = 'Give your pet a name to save';
    if (feedTimes.length === 0) nextErrors.feedTimes = 'Add at least one feed time';
    if (pee.error) nextErrors.peeHoldHours = pee.error;
    if (poop.error) nextErrors.poopHoldHours = poop.error;
    if (nextErrors.name || nextErrors.feedTimes || nextErrors.peeHoldHours || nextErrors.poopHoldHours) {
      setErrors(nextErrors);
      return;
    }
    const edits = {
      name: name.trim(),
      avatar,
      breed: breed.trim(),
      age: age.trim(),
      feedTimes,
      peeHoldHours: pee.value,
      poopHoldHours: poop.value,
      medications: medications
        .map((m) => ({ id: m.rowId, name: m.name.trim(), time: m.time.trim() }))
        .filter((m) => m.name && m.time),
    };
    if (isEditing) {
      updatePet(editingPet.id, edits);
    } else {
      addPet(edits);
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <View style={{ width: 32 }} />
          <Text style={styles.modalTitle}>{isEditing ? 'Edit Pet' : 'New Pet'}</Text>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <SectionTitle>Species</SectionTitle>
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map((emoji) => {
            const selected = avatar === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => setAvatar(emoji)}
                accessibilityRole="button"
                accessibilityLabel={AVATAR_LABELS[emoji] ?? 'Pet type'}
                accessibilityState={{ selected }}
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

        <Field
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            clearError('name');
          }}
          placeholder="e.g. Biscuit"
          error={errors.name}
        />
        <Field label="Breed" value={breed} onChangeText={setBreed} placeholder="e.g. Beagle" />
        <Field label="Age" value={age} onChangeText={setAge} placeholder="e.g. 1 yr" />

        <SectionTitle>Feeding & Potty Schedule</SectionTitle>
        <Text style={styles.helperText}>
          Required — this drives every meal reminder and potty-break prediction. At least one feed
          time and both hold times are needed so the schedule starts working right away.
        </Text>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Usual Feed Times</Text>
          {feedRows.map((row, i) => (
            <View key={row.rowId} style={styles.feedRow}>
              <TimePickerField
                value={row.time}
                onChange={(v) => updateFeedRow(row.rowId, v)}
                placeholder={`Feed time ${i + 1}`}
                style={styles.feedTimeInput}
              />
              <Pressable
                style={({ pressed }) => [styles.removeMedBtn, pressed && styles.pressed]}
                onPress={() => removeFeedRow(row.rowId)}
                accessibilityRole="button"
                accessibilityLabel={`Remove feed time ${i + 1}`}
                hitSlop={8}
              >
                <Text style={styles.removeMedBtnText}>✕</Text>
              </Pressable>
            </View>
          ))}
          {feedRows.length < MAX_FEED_TIMES && (
            <Pressable
              style={({ pressed }) => [styles.addMedBtn, styles.addFeedBtn, pressed && styles.pressed]}
              onPress={addFeedRow}
              accessibilityRole="button"
              accessibilityLabel="Add feed time"
            >
              <Text style={styles.addMedBtnText}>➕ Add Feed Time</Text>
            </Pressable>
          )}
          {errors.feedTimes ? <Text style={styles.errorText}>{errors.feedTimes}</Text> : null}
        </View>

        <View style={styles.row2}>
          <Field
            label="Hold Pee (hrs)"
            value={peeHoldHours}
            onChangeText={(v) => {
              setPeeHoldHours(v);
              clearError('peeHoldHours');
            }}
            placeholder="e.g. 4"
            keyboardType="numeric"
            style={{ flex: 1 }}
            error={errors.peeHoldHours}
          />
          <Field
            label="Hold Poop (hrs)"
            value={poopHoldHours}
            onChangeText={(v) => {
              setPoopHoldHours(v);
              clearError('poopHoldHours');
            }}
            placeholder="e.g. 6"
            keyboardType="numeric"
            style={{ flex: 1 }}
            error={errors.poopHoldHours}
          />
        </View>

        <SectionTitle>Medications</SectionTitle>
        <Text style={styles.helperText}>
          Optional — only add these if {name.trim() || 'your pet'} needs regular medicine. They'll show up in
          Upcoming on Home regardless of calibration status.
        </Text>

        {medications.map((med) => (
          <View key={med.rowId} style={styles.medRow}>
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
              style={({ pressed }) => [styles.removeMedBtn, pressed && styles.pressed]}
              onPress={() => removeMedicationRow(med.rowId)}
              accessibilityRole="button"
              accessibilityLabel={med.name.trim() ? `Remove ${med.name.trim()}` : 'Remove medication'}
              hitSlop={8}
            >
              <Text style={styles.removeMedBtnText}>✕</Text>
            </Pressable>
          </View>
        ))}

        {medications.length < MAX_MEDICATIONS && (
          <Pressable
            style={({ pressed }) => [styles.addMedBtn, pressed && styles.pressed]}
            onPress={addMedicationRow}
            accessibilityRole="button"
            accessibilityLabel="Add medication"
          >
            <Text style={styles.addMedBtnText}>➕ Add Medication</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Save changes' : 'Save pet'}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Save Pet'}</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  style,
  error,
  ...inputProps
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  style?: object;
  error?: string;
}) {
  return (
    <View style={[styles.formGroup, style]}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[
          styles.input,
          inputProps.value ? styles.inputFilled : null,
          error ? styles.inputError : null,
        ]}
        placeholderTextColor={colors.stoneLight}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  handle: { width: 40, height: 4, backgroundColor: colors.stoneLight, borderRadius: 99, alignSelf: 'center', marginTop: 12, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: fonts.black, color: colors.stone, textAlign: 'center', flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stoneMid },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
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
  formGroup: { marginBottom: 14, gap: 5 },
  formLabel: { fontSize: 11, fontFamily: fonts.extraBold, textTransform: 'uppercase', letterSpacing: 1, color: colors.stoneMid },
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
  errorText: { fontSize: 12, fontFamily: fonts.semiBold, color: '#C0392B' },
  helperText: { fontSize: 12, color: colors.stoneMid, lineHeight: 17, marginBottom: 14 },
  feedRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  feedTimeInput: { flex: 1 },
  addFeedBtn: { marginBottom: 0 },
  row2: { flexDirection: 'row', gap: 10 },
  medRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  medNameInput: { flex: 1.4 },
  medTimeInput: { flex: 1 },
  removeMedBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDECEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMedBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: '#C0392B' },
  addMedBtn: {
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  addMedBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.stoneMid },
  saveBtn: { backgroundColor: colors.sage, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  saveBtnText: { color: colors.white, fontSize: 15, fontFamily: fonts.extraBold },
});
