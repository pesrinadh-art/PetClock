import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { SectionTitle } from '../components/SectionTitle';
import { TimePickerField } from '../components/TimePickerField';
import { usePets } from '../context/PetsContext';

const AVATAR_OPTIONS = ['🐶', '🐱', '🐰', '🐹', '🐦', '🐢', '🐍', '🐠'];
const MAX_MEDICATIONS = 5;

type MedRow = { rowId: string; name: string; time: string };

function makeRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  const [feedTimes, setFeedTimes] = useState<string[]>(() => {
    const existing = editingPet?.feedTimes ?? [];
    return [0, 1, 2, 3].map((i) => existing[i] ?? '');
  });
  const [peeHoldHours, setPeeHoldHours] = useState(editingPet?.peeHoldHours?.toString() ?? '');
  const [poopHoldHours, setPoopHoldHours] = useState(editingPet?.poopHoldHours?.toString() ?? '');
  const [medications, setMedications] = useState<MedRow[]>(
    () => editingPet?.medications.map((m) => ({ rowId: m.id, name: m.name, time: m.time })) ?? []
  );

  const canSave = name.trim().length > 0;

  const setFeedTimeAt = (index: number, value: string) => {
    setFeedTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
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
    if (!canSave) return;
    const peeHours = parseFloat(peeHoldHours);
    const poopHours = parseFloat(poopHoldHours);
    const edits = {
      name: name.trim(),
      avatar,
      breed: breed.trim(),
      age: age.trim(),
      feedTimes: feedTimes.map((t) => t.trim()).filter(Boolean),
      peeHoldHours: Number.isFinite(peeHours) && peeHours > 0 ? peeHours : null,
      poopHoldHours: Number.isFinite(poopHours) && poopHours > 0 ? poopHours : null,
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <View style={{ width: 32 }} />
          <Text style={styles.modalTitle}>{isEditing ? 'Edit Pet' : 'New Pet'}</Text>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            onPress={() => router.back()}
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

        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Biscuit" />
        <Field label="Breed" value={breed} onChangeText={setBreed} placeholder="e.g. Beagle" />
        <Field label="Age" value={age} onChangeText={setAge} placeholder="e.g. 1 yr" />

        <SectionTitle>Feeding & Potty Schedule</SectionTitle>
        <Text style={styles.helperText}>
          Optional — skip it and we'll show "Calibrating" on Home for a few days. If it's still
          blank after that, we'll prompt you to fill it in.
        </Text>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Usual Feed Times</Text>
          <View style={styles.feedTimesGrid}>
            {feedTimes.map((time, i) => (
              <TimePickerField
                key={i}
                value={time}
                onChange={(v) => setFeedTimeAt(i, v)}
                placeholder={`Feed time ${i + 1}`}
                style={styles.feedTimeInput}
              />
            ))}
          </View>
        </View>

        <View style={styles.row2}>
          <Field
            label="Hold Pee (hrs)"
            value={peeHoldHours}
            onChangeText={setPeeHoldHours}
            placeholder="e.g. 4"
            keyboardType="numeric"
            style={{ flex: 1 }}
          />
          <Field
            label="Hold Poop (hrs)"
            value={poopHoldHours}
            onChangeText={setPoopHoldHours}
            placeholder="e.g. 6"
            keyboardType="numeric"
            style={{ flex: 1 }}
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
          >
            <Text style={styles.addMedBtnText}>➕ Add Medication</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.saveBtn, !canSave && styles.saveBtnDisabled, pressed && canSave && styles.saveBtnPressed]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Save Pet'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  style,
  ...inputProps
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  style?: object;
}) {
  return (
    <View style={[styles.formGroup, style]}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[styles.input, inputProps.value ? styles.inputFilled : null]}
        placeholderTextColor={colors.stoneLight}
      />
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
  helperText: { fontSize: 12, color: colors.stoneMid, lineHeight: 17, marginBottom: 14 },
  feedTimesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  feedTimeInput: { width: '48%' },
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
  saveBtnDisabled: { backgroundColor: colors.stoneLight },
  saveBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  saveBtnText: { color: colors.white, fontSize: 15, fontFamily: fonts.extraBold },
});
