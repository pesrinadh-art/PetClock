import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { surface, ink, line, green, terracotta, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { Card, SectionLabel } from './ui';
import { TimePickerField } from './TimePickerField';
import { BreedAutocomplete } from './BreedAutocomplete';
import { usePets } from '../context/PetsContext';
import { removePetPhoto, setPetPhoto, usePetPhoto } from '../lib/petPhotos';
import { to12h, to24h } from '../lib/petFormTime';
import { AVATAR_LABELS, AVATAR_OPTIONS } from '../lib/petKinds';
import type { Species } from '../lib/db/models';

export type WizardStep = 'about' | 'routine' | 'meds';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'about', label: 'About' },
  { key: 'routine', label: 'Routine' },
  { key: 'meds', label: 'Meds' },
];

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

/**
 * "Welcome a new pet" (redesign v3) — a 3-step wizard: About → Routine → Meds. Only the name is
 * required. Used to add a pet, to edit one (pre-filled; `initialStep` jumps to a step, and every
 * step stays reachable from the step bar), and inside onboarding.
 *
 * Saving writes through the same PetsContext add/update paths as the old single-page form, plus
 * the device-local photo.
 */
export function PetWizard({
  petId,
  initialStep = 'about',
  onClose,
  onSaved,
  closeIcon = 'close',
}: {
  petId?: string;
  initialStep?: WizardStep;
  onClose: () => void;
  onSaved: (petId: string) => void;
  closeIcon?: 'close' | 'chevronLeft';
}) {
  const { pets, addPet, updatePet, getFeedTimesForPet, getMedicationsForPet } = usePets();
  const editingPet = petId ? pets.find((p) => p.id === petId) : undefined;
  const isEditing = !!editingPet;

  const [step, setStep] = useState<WizardStep>(initialStep);
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // Device-local photo (kept out of the frozen Pet contract — see lib/petPhotos).
  const storedPhoto = usePetPhoto(editingPet?.id ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTouched, setPhotoTouched] = useState(false);
  const displayPhoto = photoTouched ? photoUri : storedPhoto;

  const [avatar, setAvatar] = useState<string>(editingPet?.avatarEmoji ?? AVATAR_OPTIONS[0]);
  const [name, setName] = useState(editingPet?.name ?? '');
  const [breed, setBreed] = useState(editingPet?.breed ?? '');
  const [feedRows, setFeedRows] = useState<FeedRow[]>(() => {
    const existing = editingPet ? getFeedTimesForPet(editingPet.id) : [];
    const rows = existing.map((ft) => ({ rowId: makeRowId(), time: to12h(ft.localTime) }));
    return rows.length > 0 ? rows : [{ rowId: makeRowId(), time: '' }, { rowId: makeRowId(), time: '' }];
  });
  const [peeHoldHours, setPeeHoldHours] = useState(editingPet?.peeHoldHours?.toString() ?? '');
  const [poopHoldHours, setPoopHoldHours] = useState(editingPet?.poopHoldHours?.toString() ?? '');
  const [medications, setMedications] = useState<MedRow[]>(() =>
    (editingPet ? getMedicationsForPet(editingPet.id) : []).map((m) => ({
      rowId: m.id,
      name: m.name,
      time: to12h(m.localTime),
    })),
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const petName = name.trim() || (isEditing ? editingPet.name : 'your pet');

  const clearError = (field: keyof FormErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const pickPhoto = async () => {
    // Native needs media-library permission; web uses a file input. Denial is a no-op.
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

  const goTo = (target: WizardStep) => {
    // Leaving "About" for the first time needs a name; everything else is optional.
    if (step === 'about' && target !== 'about' && name.trim().length === 0) {
      setErrors((prev) => ({ ...prev, name: 'Give your pet a name to continue' }));
      return;
    }
    setStep(target);
  };

  const handleSave = () => {
    const pee = parseHoldHours(peeHoldHours);
    const poop = parseHoldHours(poopHoldHours);
    const feedTimes = feedRows.map((r) => to24h(r.time.trim())).filter(Boolean);
    const nextErrors: FormErrors = {};
    if (name.trim().length === 0) nextErrors.name = 'Give your pet a name to save';
    if (pee.error) nextErrors.peeHoldHours = pee.error;
    if (poop.error) nextErrors.poopHoldHours = poop.error;
    if (nextErrors.name || nextErrors.peeHoldHours || nextErrors.poopHoldHours) {
      setErrors(nextErrors);
      setStep(nextErrors.name ? 'about' : 'routine');
      return;
    }
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
      if (photoTouched) {
        if (photoUri) void setPetPhoto(editingPet.id, photoUri);
        else void removePetPhoto(editingPet.id);
      }
      onSaved(editingPet.id);
    } else {
      const kind = AVATAR_LABELS[avatar]?.toLowerCase() as Species | undefined;
      const newPetId = addPet({ ...edits, ...(kind ? { species: kind } : {}) });
      if (photoUri) void setPetPhoto(newPetId, photoUri);
      onSaved(newPetId);
    }
  };

  const isLast = stepIndex === STEPS.length - 1;
  const next = STEPS[stepIndex + 1];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={onClose}
          role="button"
          aria-label={closeIcon === 'close' ? 'Close' : 'Back'}
          hitSlop={8}
        >
          <Icon name={closeIcon} size={18} color={ink.primary} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isEditing ? `Edit ${editingPet.name}` : 'Welcome a new pet'}</Text>
          <Text style={styles.headerSub}>
            {isEditing ? 'Change anything, then save.' : 'Three quick steps. Only the name is needed.'}
          </Text>
        </View>
      </View>

      {/* Step bar */}
      <View style={styles.stepBar}>
        <Text style={styles.stepCount}>
          Step {stepIndex + 1} of {STEPS.length}
        </Text>
        <View style={styles.bars}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={[styles.bar, i <= stepIndex && styles.barOn]} />
          ))}
        </View>
        <View style={styles.stepLabels}>
          {STEPS.map((s, i) => {
            const active = s.key === step;
            return (
              <Pressable
                key={s.key}
                style={styles.stepLabel}
                onPress={() => goTo(s.key)}
                role="tab"
                aria-selected={active}
                aria-label={`Step ${i + 1}: ${s.label}`}
              >
                <View style={[styles.stepNum, active && styles.stepNumOn]}>
                  <Text style={[styles.stepNumText, active && styles.stepNumTextOn]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepLabelText, active && styles.stepLabelTextOn]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'about' && (
          <>
            {/* Photo */}
            <View style={styles.photoWrap}>
              <View style={styles.photoRing}>
                <View style={styles.photoCircle}>
                  {displayPhoto ? (
                    <Image source={{ uri: displayPhoto }} style={styles.photoImage} />
                  ) : (
                    <Text style={styles.photoEmoji}>{avatar}</Text>
                  )}
                </View>
                <Pressable
                  style={({ pressed }) => [styles.cameraBadge, pressed && styles.pressed]}
                  onPress={() => void pickPhoto()}
                  role="button"
                  aria-label={displayPhoto ? 'Change photo' : 'Add a photo'}
                  hitSlop={6}
                >
                  <Icon name="camera" size={18} color="#ffffff" strokeWidth={2} />
                </Pressable>
              </View>
              <Text style={styles.sayHello}>{name.trim() ? `Say hello to ${name.trim()}` : 'Say hello'}</Text>
              <View style={styles.photoActions}>
                <Pressable
                  style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
                  onPress={() => void pickPhoto()}
                  role="button"
                  aria-label={displayPhoto ? 'Change photo' : 'Add a photo'}
                >
                  <Icon name="camera" size={17} color={green.primary} strokeWidth={2} />
                  <Text style={styles.photoBtnText}>{displayPhoto ? 'Change photo' : 'Add a photo'}</Text>
                </Pressable>
                {displayPhoto ? (
                  <Pressable
                    onPress={() => {
                      setPhotoUri(null);
                      setPhotoTouched(true);
                    }}
                    role="button"
                    aria-label="Remove photo"
                    hitSlop={6}
                  >
                    <Text style={styles.removePhotoText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>What's their name?</Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                clearError('name');
              }}
              placeholder="e.g. Biscuit"
              placeholderTextColor={ink.placeholder}
              style={[styles.input, errors.name ? styles.inputError : null]}
              aria-label="Pet name"
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

            {/* Kind */}
            <SectionLabel style={styles.sectionSpacer} sub="Pick the one that looks most like your pet.">
              What kind of pet?
            </SectionLabel>
            <View style={styles.kindGrid}>
              {AVATAR_OPTIONS.map((emoji) => {
                const selected = avatar === emoji;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => setAvatar(emoji)}
                    role="button"
                    aria-label={AVATAR_LABELS[emoji] ?? 'Pet type'}
                    aria-selected={selected}
                    style={({ pressed }) => [styles.kindChip, selected && styles.kindChipOn, pressed && styles.pressed]}
                  >
                    <Text style={styles.kindEmoji}>{emoji}</Text>
                    <Text style={[styles.kindText, selected && styles.kindTextOn]}>{AVATAR_LABELS[emoji]}</Text>
                    {selected && <Icon name="check" size={14} color={green.primary} strokeWidth={2.6} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Breed */}
            <Text style={[styles.fieldLabel, styles.sectionSpacer]}>Breed (optional)</Text>
            <BreedAutocomplete value={breed} onChange={setBreed} placeholder="e.g. Beagle" species={AVATAR_LABELS[avatar]} />
          </>
        )}

        {step === 'routine' && (
          <>
            <SectionLabel sub={`When does ${petName} usually eat? We'll remind you at meal time.`}>Meal times</SectionLabel>
            <Card padded>
              {feedRows.map((row, i) => (
                <View key={row.rowId} style={styles.feedRow}>
                  <TimePickerField
                    label={`Meal ${i + 1}`}
                    value={row.time}
                    onChange={(v) => setFeedRows((prev) => prev.map((r) => (r.rowId === row.rowId ? { ...r, time: v } : r)))}
                    placeholder={`Meal time ${i + 1}`}
                    style={{ flex: 1 }}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.removeChip, pressed && styles.pressed]}
                    onPress={() => setFeedRows((prev) => prev.filter((r) => r.rowId !== row.rowId))}
                    role="button"
                    aria-label={`Remove meal time ${i + 1}`}
                    hitSlop={8}
                  >
                    <Icon name="close" size={14} color={ink.faint2} strokeWidth={2.2} />
                  </Pressable>
                </View>
              ))}
              {feedRows.length < MAX_FEED_TIMES && (
                <DashedButton
                  label="Add a meal time"
                  onPress={() => setFeedRows((prev) => [...prev, { rowId: makeRowId(), time: '' }])}
                />
              )}
            </Card>

            <SectionLabel
              style={styles.sectionSpacer}
              sub={`How long can ${petName} usually hold it? Leave blank and we'll learn it in a few days.`}
            >
              Potty rhythm
            </SectionLabel>
            <View style={styles.holdRow}>
              <HoldTile
                label="Pee every (hours)"
                value={peeHoldHours}
                onChangeText={(v) => {
                  setPeeHoldHours(v);
                  clearError('peeHoldHours');
                }}
                placeholder="e.g. 4"
                error={errors.peeHoldHours}
              />
              <HoldTile
                label="Poo every (hours)"
                value={poopHoldHours}
                onChangeText={(v) => {
                  setPoopHoldHours(v);
                  clearError('poopHoldHours');
                }}
                placeholder="e.g. 8"
                error={errors.poopHoldHours}
              />
            </View>
          </>
        )}

        {step === 'meds' && (
          <>
            <SectionLabel sub={`Only if ${petName} takes regular medicine. Skip it otherwise.`}>Daily meds</SectionLabel>
            {medications.length > 0 && (
              <Card padded style={{ gap: 10, marginBottom: 10 }}>
                {medications.map((med) => (
                  <View key={med.rowId} style={styles.medRow}>
                    <TextInput
                      value={med.name}
                      onChangeText={(v) =>
                        setMedications((prev) => prev.map((m) => (m.rowId === med.rowId ? { ...m, name: v } : m)))
                      }
                      placeholder="Medicine name"
                      placeholderTextColor={ink.placeholder}
                      style={styles.medNameInput}
                      aria-label="Medicine name"
                    />
                    <View style={{ flex: 1 }}>
                      <TimePickerField
                        value={med.time}
                        onChange={(v) =>
                          setMedications((prev) => prev.map((m) => (m.rowId === med.rowId ? { ...m, time: v } : m)))
                        }
                        placeholder="Time"
                      />
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.removeChip, pressed && styles.pressed]}
                      onPress={() => setMedications((prev) => prev.filter((m) => m.rowId !== med.rowId))}
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
              <DashedButton
                label="Add a medicine"
                onPress={() => setMedications((prev) => [...prev, { rowId: makeRowId(), name: '', time: '' }])}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Footer: Back + Next/Save. Editing can save from any step. */}
      <View style={styles.footer}>
        {stepIndex > 0 && (
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => setStep(STEPS[stepIndex - 1].key)}
            role="button"
            aria-label="Previous step"
          >
            <Icon name="chevronLeft" size={20} color={green.primary} strokeWidth={2.3} />
          </Pressable>
        )}
        {isEditing && !isLast ? (
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={() => goTo(next.key)}
            role="button"
            aria-label={`Next: ${next.label}`}
          >
            <Text style={styles.secondaryBtnText}>Next</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
          onPress={isLast || isEditing ? handleSave : () => goTo(next.key)}
          role="button"
          aria-label={isLast || isEditing ? 'Save' : `Next: ${next.label}`}
        >
          {isLast || isEditing ? (
            <>
              <Icon name="check" size={18} color="#ffffff" strokeWidth={2.6} />
              <Text style={styles.primaryText}>{isEditing ? 'Save changes' : `Save ${name.trim() || 'pet'}`}</Text>
            </>
          ) : (
            <>
              <Text style={styles.primaryText}>Next: {next.label}</Text>
              <Icon name="arrowRight" size={18} color="#ffffff" strokeWidth={2.4} />
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function DashedButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.dashed, pressed && styles.pressed]} onPress={onPress} role="button" aria-label={label}>
      <Icon name="plus" size={15} color={green.primary} strokeWidth={2.4} />
      <Text style={styles.dashedText}>{label}</Text>
    </Pressable>
  );
}

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
    <View style={{ flex: 1 }}>
      <View style={[styles.holdTile, error ? styles.inputError : null]}>
        <Text style={styles.holdLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ink.placeholder}
          keyboardType="numeric"
          style={styles.holdInput}
          aria-label={label}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 23, fontFamily: fonts.extraBold, color: ink.primary, letterSpacing: -0.6 },
  headerSub: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, marginTop: 1 },

  stepBar: { paddingHorizontal: 20, paddingBottom: 6 },
  stepCount: { fontSize: 12.5, fontFamily: fonts.semiBold, color: ink.muted },
  bars: { flexDirection: 'row', gap: 8, marginTop: 8 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#ece6d9' },
  barOn: { backgroundColor: green.mid },
  stepLabels: { flexDirection: 'row', marginTop: 10 },
  stepLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumOn: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: green.mid },
  stepNumText: { fontSize: 11, fontFamily: fonts.bold, color: ink.muted },
  stepNumTextOn: { color: green.primary },
  stepLabelText: { fontSize: 13, fontFamily: fonts.semiBold, color: ink.muted },
  stepLabelTextOn: { fontFamily: fonts.bold, color: green.primary },

  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
  sectionSpacer: { marginTop: 22 },

  photoWrap: { alignItems: 'center', marginBottom: 6 },
  photoRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  photoCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: 136, height: 136, borderRadius: 68 },
  photoEmoji: { fontSize: 66 },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: green.mid,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sayHello: { fontSize: 20, fontFamily: fonts.extraBold, color: ink.primary, marginTop: 14, letterSpacing: -0.4 },
  photoActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: radius.tile,
    backgroundColor: green.tint,
  },
  photoBtnText: { fontSize: 14, fontFamily: fonts.bold, color: green.primary },
  removePhotoText: { fontSize: 13, fontFamily: fonts.bold, color: terracotta.primary },

  fieldLabel: { fontSize: 15, fontFamily: fonts.bold, color: ink.primary, marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: surface.card,
    borderWidth: 1.5,
    borderColor: line.border,
    borderRadius: radius.tile,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: ink.primary,
  },
  inputError: { borderColor: terracotta.primary, borderWidth: 1.5 },
  errorText: { fontSize: 12, fontFamily: fonts.semiBold, color: terracotta.primary, marginTop: 5, marginLeft: 4 },

  kindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.card,
  },
  kindChipOn: { backgroundColor: green.tint, borderColor: green.mid },
  kindEmoji: { fontSize: 18 },
  kindText: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  kindTextOn: { color: green.primary },

  feedRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
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
  dashed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
  },
  dashedText: { fontSize: 13.5, fontFamily: fonts.bold, color: green.primary },

  holdRow: { flexDirection: 'row', gap: 10 },
  holdTile: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.tile,
    backgroundColor: surface.card,
    borderWidth: 1.5,
    borderColor: line.border,
  },
  holdLabel: { fontSize: 12, fontFamily: fonts.semiBold, color: ink.muted },
  holdInput: { fontFamily: fonts.bold, fontSize: 16, color: ink.primary, padding: 0, marginTop: 4 },

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

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: line.border,
    backgroundColor: surface.app,
  },
  backBtn: {
    width: 54,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    paddingHorizontal: 18,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontFamily: fonts.bold, color: green.primary },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.card,
    backgroundColor: green.mid,
    ...shadow.fab,
  },
  primaryPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  primaryText: { fontSize: 16, fontFamily: fonts.bold, color: '#ffffff' },
});
