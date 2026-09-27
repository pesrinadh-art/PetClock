import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { surface, ink, green, radius, shadow, space, tap } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import { Icon } from '../components/Icon';
import {
  Banner,
  Button,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  IconButton,
  PetEmptyState,
  Screen,
  ScreenHeader,
  SectionLabel,
  TextField,
} from '../components/ui';
import { TimePickerField } from '../components/TimePickerField';
import { BreedAutocomplete } from '../components/BreedAutocomplete';
import { StepProgress } from '../components/pets/StepProgress';
import { usePets } from '../context/PetsContext';
import { removePetPhoto, setPetPhoto, usePetPhoto } from '../lib/petPhotos';
import { parseClockTime } from '../lib/petSchedule';
import { possessive, speciesCheer } from '../lib/petVoice';

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

/** The form is split into three bite-sized steps (presentation only; one save at the end). */
const STEPS = ['About', 'Routine', 'Meds'] as const;
const LAST_STEP = STEPS.length - 1;

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
    return { value: null, error: `That looks a little off. Try a number of hours from ${HOLD_HOURS_MIN} to ${HOLD_HOURS_MAX}.` };
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
  // Presentation-only: which of the three steps is on screen.
  const [step, setStep] = useState(0);

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
    if (name.trim().length === 0) nextErrors.name = 'What should we call your pet? Add a name to save.';
    if (pee.error) nextErrors.peeHoldHours = pee.error;
    if (poop.error) nextErrors.poopHoldHours = poop.error;
    if (nextErrors.name || nextErrors.peeHoldHours || nextErrors.poopHoldHours) {
      setErrors(nextErrors);
      // Presentation: jump to the step that holds the first thing to fix.
      setStep(nextErrors.name ? 0 : 1);
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

  // ── Step navigation (presentation only) ──────────────────────────────────
  const trimmedName = name.trim();
  const displayName = trimmedName || 'your pet';
  const their = possessive(trimmedName || null);
  const speciesWord = AVATAR_LABELS[avatar]?.toLowerCase() ?? 'other';

  const goNext = () => {
    if (step === 0 && !trimmedName) {
      setErrors((prev) => ({ ...prev, name: 'What should we call your pet? Add a name to continue.' }));
      return;
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  };
  const goBackStep = () => setStep((s) => Math.max(0, s - 1));
  const canJumpTo = (i: number) => isEditing || i <= step || !!trimmedName;

  const saveLabel = isEditing ? 'Save changes' : trimmedName ? `Save ${trimmedName}` : 'Save pet';

  const footer = (
    <View style={styles.footerRow}>
      {step > 0 ? (
        <Button label="Back" variant="secondary" icon="chevronLeft" onPress={goBackStep} style={styles.footerBack} />
      ) : null}
      {isEditing || step === LAST_STEP ? (
        <Button
          label={saveLabel}
          icon="check"
          onPress={handleSave}
          style={styles.footerMain}
        />
      ) : (
        <Button
          label={`Next: ${STEPS[step + 1]}`}
          iconRight="arrowRight"
          onPress={goNext}
          style={styles.footerMain}
        />
      )}
    </View>
  );

  const header = (
    <View>
      <ScreenHeader
        title={isEditing ? `Edit ${editingPet?.name ?? 'pet'}` : 'Welcome a new pet'}
        subtitle={isEditing ? 'Changes save when you tap Save' : 'Three quick steps. Only the name is needed.'}
        onBack={closeForm}
        backIcon="close"
        backLabel="Close"
      />
      <View style={styles.stepper}>
        <StepProgress steps={[...STEPS]} current={step} onSelect={setStep} canSelect={canJumpTo} />
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={header} footer={footer} edges={['top']}>
        {step === 0 && (
          <View>
            {/* Photo — the pet's face is the hero. */}
            <View style={styles.photoBlock}>
              <Pressable
                onPress={() => void pickPhoto()}
                role="button"
                aria-label={displayPhoto ? 'Change photo' : 'Add photo'}
                style={({ pressed }) => [styles.photoPress, pressed && styles.pressed]}
              >
                <View style={styles.photoRing}>
                  <View style={styles.photoCircle}>
                    {displayPhoto ? (
                      <Image source={{ uri: displayPhoto }} style={styles.photoImage} />
                    ) : (
                      <Text style={styles.photoEmoji}>{avatar}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.cameraBadge}>
                  <Icon name="camera" size={18} color={ink.onDark} strokeWidth={2.2} />
                </View>
              </Pressable>
              <Text style={styles.hello} role="heading">
                {trimmedName ? `${speciesCheer(speciesWord)} Hi, ${trimmedName}!` : isEditing ? 'Looking good' : 'Say hello'}
              </Text>
              <View style={styles.photoActions}>
                <Button
                  label={displayPhoto ? 'Change photo' : 'Add a photo'}
                  icon="camera"
                  variant="soft"
                  size="md"
                  onPress={() => void pickPhoto()}
                />
                {displayPhoto ? (
                  <Button
                    label="Remove photo"
                    variant="ghost"
                    tone="neutral"
                    size="md"
                    onPress={clearPhoto}
                  />
                ) : null}
              </View>
            </View>

            <TextField
              label="What's their name?"
              value={name}
              onChangeText={(v) => {
                setName(v);
                clearError('name');
              }}
              placeholder="e.g. Biscuit"
              error={errors.name}
              autoCapitalize="words"
              returnKeyType="next"
              containerStyle={styles.fieldGap}
            />

            <SectionLabel style={styles.sectionSpacer} hint={`Pick the one that looks most like ${displayName}.`}>
              What kind of pet?
            </SectionLabel>
            <ChoiceChipRow>
              {AVATAR_OPTIONS.map((emoji) => (
                <ChoiceChip
                  key={emoji}
                  label={AVATAR_LABELS[emoji] ?? 'Pet type'}
                  leading={<Text style={styles.chipEmoji}>{emoji}</Text>}
                  selected={avatar === emoji}
                  onPress={() => setAvatar(emoji)}
                />
              ))}
            </ChoiceChipRow>

            <View style={styles.sectionSpacer}>
              <BreedAutocomplete
                label="Breed (optional)"
                value={breed}
                onChange={setBreed}
                placeholder="e.g. Beagle"
                species={AVATAR_LABELS[avatar]}
              />
            </View>
            {/* TODO(post-SYNC-1): species + birthdate pickers — the free-text Age field is dropped
                this wave (birthdate stays null; breed alone shows where age used to). */}
          </View>
        )}

        {step === 1 && (
          <View>
            <Banner
              tone="pet"
              icon="sparkle"
              compact
              title="Not sure yet? That's okay."
              body={`Add what you know. We'll learn ${their} rhythm over the first few days and nudge you if anything's still blank.`}
            />

            <SectionLabel style={styles.sectionSpacer} hint={`When does ${displayName} usually eat?`}>
              Meal times
            </SectionLabel>
            <Card padded>
              {feedRows.map((row, i) => (
                <View key={row.rowId} style={styles.feedRow}>
                  <TimePickerField
                    label={`Meal ${i + 1}`}
                    value={row.time}
                    onChange={(v) => updateFeedRow(row.rowId, v)}
                    placeholder="Pick a time"
                    style={styles.feedTimeInput}
                  />
                  <IconButton
                    icon="close"
                    variant="chip"
                    size={tap.min}
                    onPress={() => removeFeedRow(row.rowId)}
                    accessibilityLabel={`Remove feed time ${i + 1}`}
                    style={styles.removeBtn}
                  />
                </View>
              ))}
              {feedRows.length === 0 ? (
                <Text style={styles.cardEmpty}>No meal times yet. Add one below.</Text>
              ) : null}
              {feedRows.length < MAX_FEED_TIMES && (
                <Button
                  label="Add a meal time"
                  icon="plus"
                  tone="food"
                  variant="soft"
                  size="md"
                  fullWidth
                  onPress={addFeedRow}
                />
              )}
            </Card>

            <SectionLabel
              style={styles.sectionSpacer}
              hint={`How long can ${displayName} usually wait between breaks? In hours.`}
            >
              Potty rhythm
            </SectionLabel>
            <View style={styles.holdRow}>
              <TextField
                label="Between pees"
                value={peeHoldHours}
                onChangeText={(v) => {
                  setPeeHoldHours(v);
                  clearError('peeHoldHours');
                }}
                placeholder="e.g. 4"
                keyboardType="numeric"
                suffix="hrs"
                error={errors.peeHoldHours}
                containerStyle={styles.holdField}
              />
              <TextField
                label="Between poos"
                value={poopHoldHours}
                onChangeText={(v) => {
                  setPoopHoldHours(v);
                  clearError('poopHoldHours');
                }}
                placeholder="e.g. 6"
                keyboardType="numeric"
                suffix="hrs"
                error={errors.poopHoldHours}
                containerStyle={styles.holdField}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <SectionLabel
              hint={`Only if ${displayName} takes regular medicine. They'll show up on Home, and we'll nudge you when it's due.`}
            >
              {`${their.charAt(0).toUpperCase()}${their.slice(1)} meds`}
            </SectionLabel>

            {medications.length > 0 ? (
              <>
                {medications.map((med, i) => (
                  <Card padded key={med.rowId} style={styles.medCard}>
                    <View style={styles.medHead}>
                      <Text style={styles.medTitle}>Medicine {i + 1}</Text>
                      <IconButton
                        icon="trash"
                        variant="plain"
                        size={tap.min}
                        onPress={() => removeMedicationRow(med.rowId)}
                        accessibilityLabel={med.name.trim() ? `Remove ${med.name.trim()}` : 'Remove medication'}
                      />
                    </View>
                    <TextField
                      label="Name"
                      value={med.name}
                      onChangeText={(v) => updateMedicationRow(med.rowId, 'name', v)}
                      placeholder="e.g. Apoquel"
                      containerStyle={styles.fieldGap}
                    />
                    <TimePickerField
                      label="Time each day"
                      value={med.time}
                      onChange={(v) => updateMedicationRow(med.rowId, 'time', v)}
                      placeholder="Pick a time"
                    />
                  </Card>
                ))}
                {medications.length < MAX_MEDICATIONS && (
                  <Button
                    label="Add another medication"
                    icon="plus"
                    tone="med"
                    variant="soft"
                    size="md"
                    fullWidth
                    onPress={addMedicationRow}
                  />
                )}
              </>
            ) : (
              <PetEmptyState
                variant="card"
                icon="pill"
                tone="med"
                title={`No regular meds for ${displayName}?`}
                body="Great, you can skip this step. You can always add some later."
                action={{ label: 'Add a medication', icon: 'plus', onPress: addMedicationRow }}
              />
            )}

            {!isEditing ? (
              <View style={styles.readyCard}>
                <View style={styles.readyAvatar}>
                  {displayPhoto ? (
                    <Image source={{ uri: displayPhoto }} style={styles.readyImage} />
                  ) : (
                    <Text style={styles.readyEmoji}>{avatar}</Text>
                  )}
                </View>
                <View style={styles.readyText}>
                  <Text style={styles.readyTitle}>{trimmedName ? `${trimmedName} is ready` : 'Almost there'}</Text>
                  <Text style={styles.readyBody}>
                    {trimmedName
                      ? `Tap Save and we'll start tracking ${their} day.`
                      : 'Go back to About and add a name to save.'}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const PHOTO = 120;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: surface.app },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  stepper: { paddingHorizontal: space.gutter, paddingBottom: space.sm },

  // Footer
  footerRow: { flexDirection: 'row', gap: space.xs },
  footerBack: { flexGrow: 0 },
  footerMain: { flex: 1, alignSelf: 'stretch' },

  // Photo
  photoBlock: { alignItems: 'center', marginTop: space.sm },
  photoPress: { width: PHOTO + 12, height: PHOTO + 12 },
  photoRing: {
    width: PHOTO + 12,
    height: PHOTO + 12,
    borderRadius: (PHOTO + 12) / 2,
    backgroundColor: surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  photoCircle: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2 },
  photoEmoji: { fontSize: 60 },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: green.mid,
    borderWidth: 3,
    borderColor: surface.app,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hello: { ...type.title, color: ink.primary, marginTop: space.md, textAlign: 'center' },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.xs, marginTop: space.sm },

  // Sections
  sectionSpacer: { marginTop: space.section },
  fieldGap: { marginTop: space.xl },
  chipEmoji: { fontSize: 18 },

  // Feed rows
  feedRow: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-end', marginBottom: space.sm },
  feedTimeInput: { flex: 1 },
  removeBtn: { marginBottom: 6 },
  cardEmpty: { ...type.bodySm, color: ink.muted, marginBottom: space.sm },

  // Hold fields
  holdRow: { flexDirection: 'row', gap: space.sm },
  holdField: { flex: 1 },

  // Medications
  medCard: { marginBottom: space.sm },
  medHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: tap.min, marginTop: -8 },
  medTitle: { ...type.subhead, color: ink.primary },

  // Ready card
  readyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.section,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: green.wash,
    borderWidth: 1,
    borderColor: green.tintBorder,
  },
  readyAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  readyImage: { width: 56, height: 56, borderRadius: 28 },
  readyEmoji: { fontSize: 28 },
  readyText: { flex: 1, minWidth: 0 },
  readyTitle: { ...type.subhead, fontFamily: fonts.extraBold, color: green.primary },
  readyBody: { ...type.bodySm, color: ink.muted, marginTop: 2 },
});
