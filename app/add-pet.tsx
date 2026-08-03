import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { SectionTitle } from '../components/SectionTitle';
import { TimePickerField } from '../components/TimePickerField';
import { usePets } from '../context/PetsContext';
import { removePetPhoto, setPetPhoto, usePetPhoto } from '../lib/petPhotos';
import { parseClockTime } from '../lib/petSchedule';

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
type FormErrors = { name?: string; peeHoldHours?: string; poopHoldHours?: string };

function makeRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// TimePickerField speaks "h:mm AM/PM"; storage (FeedTime/Medication.localTime) is "HH:MM" 24h.
function to24h(display: string): string {
  const parsed = parseClockTime(display, new Date());
  if (!parsed) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}
function to12h(stored: string): string {
  const parsed = parseClockTime(stored, new Date());
  if (!parsed) return '';
  const h = parsed.getHours();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(parsed.getMinutes()).padStart(2, '0')} ${period}`;
}

/** Optional — empty is fine (returns null). When provided, must be numeric, clamped to 0.5–24. */
function parseHoldHours(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: null, error: `Enter a number between ${HOLD_HOURS_MIN} and ${HOLD_HOURS_MAX}` };
  }
  return { value: Math.min(HOLD_HOURS_MAX, Math.max(HOLD_HOURS_MIN, parsed)) };
}

export default function AddPetScreen() {
  const { pets, addPet, updatePet, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const editingPet = petId ? pets.find((p) => p.id === petId) : undefined;
  const isEditing = !!editingPet;

  // Device-local photo (kept out of the frozen Pet contract — see lib/petPhotos). `storedPhoto`
  // is the persisted uri; `photoTouched` tracks an in-session pick/remove so an unchanged edit
  // leaves the stored value alone.
  const storedPhoto = usePetPhoto(editingPet?.id ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTouched, setPhotoTouched] = useState(false);
  const displayPhoto = photoTouched ? photoUri : storedPhoto;

  const [avatar, setAvatar] = useState(editingPet?.avatarEmoji ?? AVATAR_OPTIONS[0]);
  const [name, setName] = useState(editingPet?.name ?? '');
  const [breed, setBreed] = useState(editingPet?.breed ?? '');
  const [feedRows, setFeedRows] = useState<FeedRow[]>(() => {
    // Feed times live in their own collection now; display them in the picker's 12h format.
    const existing = editingPet ? getFeedTimesForPet(editingPet.id) : [];
    const rows = existing.map((ft) => ({ rowId: makeRowId(), time: to12h(ft.localTime) }));
    return rows.length > 0 ? rows : [{ rowId: makeRowId(), time: '' }, { rowId: makeRowId(), time: '' }];
  });
  const [peeHoldHours, setPeeHoldHours] = useState(editingPet?.peeHoldHours?.toString() ?? '');
  const [poopHoldHours, setPoopHoldHours] = useState(editingPet?.poopHoldHours?.toString() ?? '');
  const [medications, setMedications] = useState<MedRow[]>(
    () =>
      (editingPet ? getMedicationsForPet(editingPet.id) : []).map((m) => ({
        rowId: m.id,
        name: m.name,
        time: to12h(m.localTime),
      }))
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const clearError = (field: keyof FormErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const pickPhoto = async () => {
    // Native needs media-library permission; web uses a file input and needs none. Denial is a
    // graceful no-op — the emoji avatar remains the fallback.
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      setPhotoTouched(true);
    }
  };

  const clearPhoto = () => {
    setPhotoUri(null);
    setPhotoTouched(true);
  };

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
    // Convert picker's "h:mm AM/PM" to storage "HH:MM" for the FeedTime collection.
    const feedTimes = feedRows.map((r) => to24h(r.time.trim())).filter(Boolean);
    const nextErrors: FormErrors = {};
    if (name.trim().length === 0) nextErrors.name = 'Give your pet a name to save';
    if (pee.error) nextErrors.peeHoldHours = pee.error;
    if (poop.error) nextErrors.poopHoldHours = poop.error;
    if (nextErrors.name || nextErrors.peeHoldHours || nextErrors.poopHoldHours) {
      setErrors(nextErrors);
      return;
    }
    // TODO(post-SYNC-1): species + birthdate pickers — species defaults to 'other' and the
    // free-text age field is dropped this wave (birthdate stays null).
    const edits = {
      name: name.trim(),
      avatarEmoji: avatar,
      breed: breed.trim(),
      feedTimes,
      peeHoldHours: pee.value,
      poopHoldHours: poop.value,
      medications: medications
        .map((m) => ({ name: m.name.trim(), localTime: to24h(m.time.trim()) }))
        .filter((m) => m.name && m.localTime),
    };
    if (isEditing) {
      updatePet(editingPet.id, edits);
      // Persist a photo change only when the user actually touched it this session.
      if (photoTouched) {
        if (photoUri) void setPetPhoto(editingPet.id, photoUri);
        else void removePetPhoto(editingPet.id);
      }
    } else {
      const newPetId = addPet(edits);
      if (photoUri) void setPetPhoto(newPetId, photoUri);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
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
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            role="button"
            aria-label="Close"
            hitSlop={8}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <SectionTitle>Photo</SectionTitle>
        <View style={styles.photoRow}>
          <View style={styles.photoPreview}>
            {displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={styles.photoImage} />
            ) : (
              <Text style={{ fontSize: 32 }}>{avatar}</Text>
            )}
          </View>
          <View style={styles.photoActions}>
            <Pressable
              style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
              onPress={() => void pickPhoto()}
              role="button"
              aria-label={displayPhoto ? 'Change photo' : 'Add photo'}
            >
              <Text style={styles.photoBtnText}>{displayPhoto ? '🖼️ Change photo' : '🖼️ Add photo'}</Text>
            </Pressable>
            {displayPhoto ? (
              <Pressable
                style={({ pressed }) => [styles.photoRemoveBtn, pressed && styles.pressed]}
                onPress={clearPhoto}
                role="button"
                aria-label="Remove photo"
              >
                <Text style={styles.photoRemoveText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <SectionTitle>Species</SectionTitle>
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
        {/* TODO(post-SYNC-1): species + birthdate pickers — the free-text Age field is dropped
            this wave (birthdate stays null; breed alone shows where age used to). */}

        <SectionTitle>Feeding & Potty Schedule</SectionTitle>
        <Text style={styles.helperText}>
          Optional — add what you know now. We'll show "Calibrating" on Home for a few days, then
          nudge you if it's still blank.
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
                role="button"
                aria-label={`Remove feed time ${i + 1}`}
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
              role="button"
              aria-label="Add feed time"
            >
              <Text style={styles.addMedBtnText}>➕ Add Feed Time</Text>
            </Pressable>
          )}
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
              role="button"
              aria-label={med.name.trim() ? `Remove ${med.name.trim()}` : 'Remove medication'}
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
            role="button"
            aria-label="Add medication"
          >
            <Text style={styles.addMedBtnText}>➕ Add Medication</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          onPress={handleSave}
          role="button"
          aria-label={isEditing ? 'Save changes' : 'Save pet'}
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
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.sagePale,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: 72, height: 72, borderRadius: 36 },
  photoActions: { flex: 1, gap: 8 },
  photoBtn: {
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.stoneMid },
  photoRemoveBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 4 },
  photoRemoveText: { fontSize: 12, fontFamily: fonts.bold, color: '#C0392B' },
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
