import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { surface, ink, line, green, terracotta, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from '../components/Icon';
import { Card, SectionLabel } from '../components/ui';
import { TimePickerField } from '../components/TimePickerField';
import { BreedAutocomplete } from '../components/BreedAutocomplete';
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

  const closeForm = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit pet' : 'New pet'}</Text>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            onPress={closeForm}
            role="button"
            aria-label="Close"
            hitSlop={8}
          >
            <Icon name="close" size={15} color={ink.muted} strokeWidth={2.3} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Photo */}
          <View style={styles.photoRow}>
            <View style={styles.avatarCircle}>
              {displayPhoto ? (
                <Image source={{ uri: displayPhoto }} style={styles.photoImage} />
              ) : (
                <Icon name="paw" size={30} color={green.mid} strokeWidth={1.8} />
              )}
            </View>
            <Pressable
              style={({ pressed }) => [styles.addPhotoBtn, pressed && styles.pressed]}
              onPress={() => void pickPhoto()}
              role="button"
              aria-label={displayPhoto ? 'Change photo' : 'Add photo'}
            >
              <Icon name="plus" size={16} color={ink.muted} strokeWidth={2} />
              <Text style={styles.addPhotoText}>{displayPhoto ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
          </View>
          {displayPhoto ? (
            <Pressable
              style={({ pressed }) => [styles.removePhoto, pressed && styles.pressed]}
              onPress={clearPhoto}
              role="button"
              aria-label="Remove photo"
            >
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </Pressable>
          ) : null}

          {/* Species */}
          <SectionLabel style={styles.sectionSpacer}>Species</SectionLabel>
          <View style={styles.speciesGrid}>
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
                    styles.speciesChip,
                    selected && styles.speciesChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.speciesChipText, selected && styles.speciesChipTextSelected]}>
                    {AVATAR_LABELS[emoji]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Name + breed */}
          <View style={styles.fieldStack}>
            <LabeledCard
              label="Name"
              value={name}
              onChangeText={(v) => {
                setName(v);
                clearError('name');
              }}
              placeholder="e.g. Biscuit"
              error={errors.name}
            />
            <BreedAutocomplete label="Breed" value={breed} onChange={setBreed} placeholder="e.g. Beagle" species={AVATAR_LABELS[avatar]} />
          </View>
          {/* TODO(post-SYNC-1): species + birthdate pickers — the free-text Age field is dropped
              this wave (birthdate stays null; breed alone shows where age used to). */}

          {/* Feeding & potty */}
          <SectionLabel style={styles.sectionSpacer} right={<Text style={styles.optionalTag}>Optional</Text>}>
            Feeding & potty
          </SectionLabel>
          <Text style={styles.helperText}>
            Add what you know now. We'll show "Calibrating" on Home for a few days, then nudge you if
            it's still blank.
          </Text>
          <Card padded>
            {feedRows.map((row, i) => (
              <View key={row.rowId} style={styles.feedRow}>
                <TimePickerField
                  label={`Feed ${i + 1}`}
                  value={row.time}
                  onChange={(v) => updateFeedRow(row.rowId, v)}
                  placeholder={`Feed time ${i + 1}`}
                  style={styles.feedTimeInput}
                />
                <Pressable
                  style={({ pressed }) => [styles.removeChip, pressed && styles.pressed]}
                  onPress={() => removeFeedRow(row.rowId)}
                  role="button"
                  aria-label={`Remove feed time ${i + 1}`}
                  hitSlop={8}
                >
                  <Icon name="close" size={14} color={ink.faint2} strokeWidth={2.2} />
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
                <Icon name="plus" size={15} color={ink.muted} strokeWidth={2.2} />
                <Text style={styles.addBtnText}>Add feed time</Text>
              </Pressable>
            )}

            <View style={styles.holdRow}>
              <HoldTile
                label="Hold pee"
                value={peeHoldHours}
                onChangeText={(v) => {
                  setPeeHoldHours(v);
                  clearError('peeHoldHours');
                }}
                placeholder="e.g. 4"
                error={errors.peeHoldHours}
              />
              <HoldTile
                label="Hold poop"
                value={poopHoldHours}
                onChangeText={(v) => {
                  setPoopHoldHours(v);
                  clearError('poopHoldHours');
                }}
                placeholder="e.g. 6"
                error={errors.poopHoldHours}
              />
            </View>
          </Card>

          {/* Medications */}
          <SectionLabel style={styles.sectionSpacer}>Medications</SectionLabel>
          <Text style={styles.helperText}>
            Only add these if {name.trim() || 'your pet'} needs regular medicine. They'll show up in
            Upcoming on Home regardless of calibration status.
          </Text>

          {medications.length > 0 && (
            <Card padded style={styles.medCard}>
              {medications.map((med) => (
                <View key={med.rowId} style={styles.medRow}>
                  <TextInput
                    value={med.name}
                    onChangeText={(v) => updateMedicationRow(med.rowId, 'name', v)}
                    placeholder="Medicine name"
                    placeholderTextColor={ink.faint2}
                    style={styles.medNameInput}
                  />
                  <View style={styles.medTimeInput}>
                    <TimePickerField
                      value={med.time}
                      onChange={(v) => updateMedicationRow(med.rowId, 'time', v)}
                      placeholder="Time"
                    />
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.removeChip, pressed && styles.pressed]}
                    onPress={() => removeMedicationRow(med.rowId)}
                    role="button"
                    aria-label={med.name.trim() ? `Remove ${med.name.trim()}` : 'Remove medication'}
                    hitSlop={8}
                  >
                    <Icon name="close" size={14} color={ink.faint2} strokeWidth={2.2} />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}

          {medications.length < MAX_MEDICATIONS && (
            <Pressable
              style={({ pressed }) => [styles.addBtnStandalone, pressed && styles.pressed]}
              onPress={addMedicationRow}
              role="button"
              aria-label="Add medication"
            >
              <Icon name="plus" size={15} color={ink.muted} strokeWidth={2.2} />
              <Text style={styles.addBtnText}>Add medication</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
            onPress={handleSave}
            role="button"
            aria-label={isEditing ? 'Save changes' : 'Save pet'}
          >
            <Icon name="check" size={15} color={ink.onDark} strokeWidth={2.6} />
            <Text style={styles.saveBtnText}>{isEditing ? 'Save changes' : 'Save pet'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** White field card with an inline uppercase label (matches the design's Name cell). */
function LabeledCard({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  error?: string;
}) {
  return (
    <View>
      <View style={styles.labeledCard}>
        <Text style={styles.cellLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ink.faint2}
          keyboardType={keyboardType}
          style={styles.cellInput}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/** Inset value well for the pee/poo hold durations (surface.field tile). */
function HoldTile({
  label,
  value,
  onChangeText,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <View style={styles.holdTileWrap}>
      <View style={[styles.holdTile, error ? styles.holdTileError : null]}>
        <Text style={styles.holdLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ink.faint2}
          keyboardType="numeric"
          style={styles.holdInput}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 19, fontFamily: fonts.black, color: ink.primary, letterSpacing: -0.4 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: surface.chipAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  // Photo
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: 72, height: 72, borderRadius: 36 },
  addPhotoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },
  addPhotoText: { fontSize: 13, fontFamily: fonts.semiBold, color: ink.muted },
  removePhoto: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 2 },
  removePhotoText: { fontSize: 12, fontFamily: fonts.bold, color: terracotta.primary },

  // Sections
  sectionSpacer: { marginTop: 20 },
  optionalTag: { fontSize: 11, fontFamily: fonts.semiBold, color: ink.faint2 },
  helperText: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, lineHeight: 17, marginBottom: 12 },

  // Species grid
  speciesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speciesChip: {
    flexGrow: 1,
    flexBasis: '22%',
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: line.border,
    alignItems: 'center',
  },
  speciesChipSelected: { backgroundColor: green.tint, borderWidth: 1.5, borderColor: green.mid },
  speciesChipText: { fontSize: 12, fontFamily: fonts.semiBold, color: ink.muted },
  speciesChipTextSelected: { fontFamily: fonts.bold, color: green.primary },

  // Name / breed
  fieldStack: { marginTop: 20, gap: 10 },
  labeledCard: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  cellLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ink.faint2,
    marginBottom: 3,
  },
  cellInput: { fontFamily: fonts.semiBold, fontSize: 14.5, color: ink.primary, padding: 0 },
  errorText: { fontSize: 12, fontFamily: fonts.semiBold, color: terracotta.primary, marginTop: 5, marginLeft: 4 },

  // Feed rows
  feedRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
  feedTimeInput: { flex: 1 },
  removeChip: {
    width: 38,
    height: 44,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: ink.muted },

  // Hold tiles
  holdRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  holdTileWrap: { flex: 1 },
  holdTile: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.tile,
    backgroundColor: surface.field,
  },
  holdTileError: { borderWidth: 1.5, borderColor: terracotta.primary },
  holdLabel: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: ink.faint2,
  },
  holdInput: { fontFamily: fonts.bold, fontSize: 14, color: ink.primary, padding: 0, marginTop: 2 },

  // Medications
  medCard: { gap: 10 },
  medRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  medNameInput: {
    flex: 1.4,
    backgroundColor: surface.field,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: ink.primary,
  },
  medTimeInput: { flex: 1 },
  addBtnStandalone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },

  // Save
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: green.mid,
    borderRadius: 15,
    paddingVertical: 16,
    marginTop: 24,
    ...shadow.fab,
  },
  saveBtnPressed: { opacity: 0.9 },
  saveBtnText: { color: ink.onDark, fontSize: 15, fontFamily: fonts.bold },
});
