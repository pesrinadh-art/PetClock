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
import { accent, danger, glass, ink, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import { Card, SectionLabel } from './ui';
import { TimePickerField } from './TimePickerField';
import { BreedAutocomplete } from './BreedAutocomplete';
import { usePets } from '../context/PetsContext';
import { removePetPhoto, setPetPhoto, usePetPhoto } from '../lib/petPhotos';
import { to12h, to24h } from '../lib/petFormTime';
import { AVATAR_LABELS, AVATAR_OPTIONS } from '../lib/petKinds';
import type { CareModuleId, Species } from '../lib/db/models';
import { GoalsStep } from './care/GoalsStep';
import {
  goalOptions,
  goalSections,
  goalsForSpeciesChange,
  goalsSpecies,
  goalsToSave,
  initialGoals,
  sameGoals,
  toggleGoal,
} from './care/goals';

export type WizardStep = 'about' | 'goals' | 'routine' | 'meds';

/** Every step, in order. Routine and Meds are shown only when the chosen goals need them. */
const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'about', label: 'About' },
  { key: 'goals', label: 'Goals' },
  { key: 'routine', label: 'Routine' },
  { key: 'meds', label: 'Meds' },
];

const STEP_COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four'];

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

/**
 * The step to show for a requested one: itself when visible, else the nearest visible step
 * before it (a step hidden by the goals, e.g. Meds without the meds goal). About and Goals are
 * always visible.
 */
function visibleStep(requested: WizardStep, visible: { key: WizardStep }[]): WizardStep {
  const at = STEPS.findIndex((s) => s.key === requested);
  for (let i = at; i >= 0; i--) {
    if (visible.some((v) => v.key === STEPS[i].key)) return STEPS[i].key;
  }
  return 'about';
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
 * "Welcome a new pet" (redesign v3) — a step wizard: About → Goals → Routine → Meds. Only the
 * name is required. Used to add a pet, to edit one (pre-filled; `initialStep` jumps to a step,
 * and every step stays reachable from the step bar), and inside onboarding.
 *
 * Goals ("What do you want help with?") picks the pet's care modules (docs/CARE_MODULES_PLAN.md):
 * pre-ticked with the species' defaults for a new pet, or the pet's stored list when editing.
 * Routine shows only the sections those goals need (meal times for meals, hold times for potty)
 * and is skipped when it would be empty; Meds is shown only with the meds goal. Hidden sections
 * keep their values, so unticking a goal never erases a routine.
 *
 * Saving writes through the same PetsContext add/update paths as the old single-page form, plus
 * the device-local photo. An edit sends `careModules` only when the goals actually changed.
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

  // Care goals. Species: the stored one when editing, else the kind picked on About.
  const [avatar, setAvatar] = useState<string>(editingPet?.avatarEmoji ?? AVATAR_OPTIONS[0]);
  const goalSpecies = goalsSpecies(editingPet, AVATAR_LABELS[avatar]);
  const storedGoals = editingPet?.careModules;
  const [goals, setGoals] = useState<CareModuleId[]>(() => initialGoals(goalSpecies, storedGoals));
  const [goalsTouched, setGoalsTouched] = useState(false);
  const options = goalOptions(goalSpecies, storedGoals);
  const sections = goalSections(goals);

  const steps = STEPS.filter(
    (s) => (s.key !== 'routine' || sections.meals || sections.potty) && (s.key !== 'meds' || sections.meds),
  );
  const [requestedStep, setStep] = useState<WizardStep>(initialStep);
  const step = visibleStep(requestedStep, steps);
  const stepIndex = steps.findIndex((s) => s.key === step);

  // Device-local photo (kept out of the frozen Pet contract — see lib/petPhotos).
  const storedPhoto = usePetPhoto(editingPet?.id ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTouched, setPhotoTouched] = useState(false);
  const displayPhoto = photoTouched ? photoUri : storedPhoto;

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
  const [nameFocused, setNameFocused] = useState(false);

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

  const pickAvatar = (emoji: string) => {
    setAvatar(emoji);
    // A new pet's goals follow its kind; an edited pet keeps its stored species and goals.
    if (!isEditing) setGoals((prev) => goalsForSpeciesChange(prev, goalsSpecies(undefined, AVATAR_LABELS[emoji]), goalsTouched));
  };

  const onToggleGoal = (id: CareModuleId) => {
    setGoals((prev) => toggleGoal(prev, id));
    setGoalsTouched(true);
  };

  const handleSave = () => {
    // Hold times are validated only while the potty goal shows them; hidden, an unparseable
    // value falls back to what is stored (nothing, for a new pet).
    const parsedPee = parseHoldHours(peeHoldHours);
    const parsedPoop = parseHoldHours(poopHoldHours);
    const pee = sections.potty || !parsedPee.error ? parsedPee : { value: editingPet?.peeHoldHours ?? null };
    const poop = sections.potty || !parsedPoop.error ? parsedPoop : { value: editingPet?.poopHoldHours ?? null };
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
      // Only a real change to the goals is written; otherwise the stored list is kept as is.
      const goalsChanged = goalsTouched && !sameGoals(goals, initialGoals(goalSpecies, storedGoals));
      updatePet(editingPet.id, goalsChanged ? { ...edits, careModules: goalsToSave(goals, storedGoals) } : edits);
      if (photoTouched) {
        if (photoUri) void setPetPhoto(editingPet.id, photoUri);
        else void removePetPhoto(editingPet.id);
      }
      onSaved(editingPet.id);
    } else {
      const kind = AVATAR_LABELS[avatar]?.toLowerCase() as Species | undefined;
      const newPetId = addPet({ ...edits, ...(kind ? { species: kind } : {}), careModules: goalsToSave(goals) });
      if (photoUri) void setPetPhoto(newPetId, photoUri);
      onSaved(newPetId);
    }
  };

  const isLast = stepIndex === steps.length - 1;
  const next = steps[stepIndex + 1];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header (ph-bar): close/back · title · mono step count */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onClose}
          role="button"
          aria-label={closeIcon === 'close' ? 'Close' : 'Back'}
          hitSlop={8}
        >
          <Icon name={closeIcon} size={18} color={ink.primary} strokeWidth={1.8} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} role="heading" numberOfLines={1}>
            {isEditing ? `Edit ${editingPet.name}` : 'Welcome a new pet'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={2}>
            {isEditing ? 'Change anything, then save.' : `${STEP_COUNT_WORDS[steps.length] ?? steps.length} quick steps. Only the name is needed.`}
          </Text>
        </View>
        <Text style={styles.stepCount} aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          {stepIndex + 1}/{steps.length}
        </Text>
      </View>

      {/* Step bar: thin progress segments + mono step labels (each label jumps to its step). */}
      <View style={styles.stepBar}>
        <View style={styles.bars}>
          {steps.map((s, i) => (
            <View key={s.key} style={[styles.bar, i <= stepIndex && styles.barOn]} />
          ))}
        </View>
        <View style={styles.stepLabels}>
          {steps.map((s, i) => {
            const active = s.key === step;
            return (
              <Pressable
                key={s.key}
                style={[
                  styles.stepLabel,
                  i === 0 ? styles.stepLabelStart : i === steps.length - 1 ? styles.stepLabelEnd : null,
                ]}
                onPress={() => goTo(s.key)}
                role="tab"
                aria-selected={active}
                aria-label={`Step ${i + 1}: ${s.label}`}
              >
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
                <View style={[styles.photoCircle, displayPhoto ? styles.photoCircleSet : null]}>
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
                  <Icon name="camera" size={15} color={accent.ink} strokeWidth={1.8} />
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
                  <Icon name="camera" size={16} color={accent.ink} strokeWidth={1.8} />
                  <Text style={styles.photoBtnText}>{displayPhoto ? 'Change photo' : 'Add a photo'}</Text>
                </Pressable>
                {displayPhoto ? (
                  <Pressable
                    style={({ pressed }) => [styles.removePhotoBtn, pressed && styles.pressed]}
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
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              style={[styles.input, nameFocused && styles.inputFocused, errors.name ? styles.inputError : null]}
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
                    onPress={() => pickAvatar(emoji)}
                    role="button"
                    aria-label={AVATAR_LABELS[emoji] ?? 'Pet type'}
                    aria-selected={selected}
                    style={({ pressed }) => [styles.kindChip, selected && styles.kindChipOn, pressed && styles.pressed]}
                  >
                    <Text style={styles.kindEmoji}>{emoji}</Text>
                    <Text style={[styles.kindText, selected && styles.kindTextOn]}>{AVATAR_LABELS[emoji]}</Text>
                    {selected && <Icon name="check" size={14} color={accent.ink} strokeWidth={2} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Breed */}
            <Text style={[styles.fieldLabel, styles.sectionSpacer]}>
              Breed <Text style={styles.fieldLabelSoft}>(optional)</Text>
            </Text>
            <BreedAutocomplete value={breed} onChange={setBreed} placeholder="e.g. Beagle" species={AVATAR_LABELS[avatar]} />
          </>
        )}

        {step === 'goals' && (
          <GoalsStep petName={petName} options={options} selected={goals} onToggle={onToggleGoal} />
        )}

        {/* Routine: only the sections the goals need. Meal times show for meals AND for potty:
            the potty prediction anchors on the day's first meal until a break is logged, so a
            potty-only pet without meal times would never leave "needs info". */}
        {step === 'routine' && (
          <>
            {(sections.meals || sections.potty) && (
              <>
                <SectionLabel
                  sub={
                    sections.meals
                      ? `When does ${petName} usually eat? We'll remind you at meal time.`
                      : `When does ${petName} usually eat? Potty predictions start from the first meal of the day.`
                  }
                >
                  Meal times
                </SectionLabel>
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
                        <Icon name="close" size={14} color={ink.muted} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                  ))}
                  {feedRows.length < MAX_FEED_TIMES && (
                    <AddButton
                      label="Add a meal time"
                      onPress={() => setFeedRows((prev) => [...prev, { rowId: makeRowId(), time: '' }])}
                    />
                  )}
                </Card>
              </>
            )}

            {sections.potty && (
              <>
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
          </>
        )}

        {step === 'meds' && (
          <>
            <SectionLabel sub={`Only if ${petName} takes regular medicine. Skip it otherwise.`}>Daily meds</SectionLabel>
            {medications.length > 0 && (
              <Card padded style={{ gap: 10, marginBottom: 12 }}>
                {medications.map((med) => (
                  <View key={med.rowId} style={styles.medRow}>
                    <GlassInput
                      value={med.name}
                      onChangeText={(v) =>
                        setMedications((prev) => prev.map((m) => (m.rowId === med.rowId ? { ...m, name: v } : m)))
                      }
                      placeholder="Medicine name"
                      style={styles.medNameInput}
                      ariaLabel="Medicine name"
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
                      <Icon name="close" size={14} color={ink.muted} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}
            {medications.length < MAX_MEDICATIONS && (
              <AddButton
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
            onPress={() => setStep(steps[stepIndex - 1].key)}
            role="button"
            aria-label="Previous step"
          >
            <Icon name="chevronLeft" size={19} color={ink.primary} strokeWidth={1.8} />
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
              <Icon name="check" size={17} color={accent.onAccent} strokeWidth={2} />
              <Text style={styles.primaryText} numberOfLines={1}>
                {isEditing ? 'Save changes' : `Save ${name.trim() || 'pet'}`}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.primaryText}>Next: {next.label}</Text>
              <Icon name="arrowRight" size={17} color={accent.onAccent} strokeWidth={1.9} />
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Ghost pill with a plus — "Add a meal time", "Add a medicine". */
function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} onPress={onPress} role="button" aria-label={label}>
      <Icon name="plus" size={15} color={accent.ink} strokeWidth={1.9} />
      <Text style={styles.addBtnText}>{label}</Text>
    </Pressable>
  );
}

/** Glass text input that shows the accent outline while focused. */
function GlassInput({
  value,
  onChangeText,
  placeholder,
  style,
  ariaLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: object;
  ariaLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={ink.placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, style, focused && styles.inputFocused]}
      aria-label={ariaLabel}
    />
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.holdTile, focused && styles.inputFocused, error ? styles.inputError : null]}>
        <Text style={styles.holdLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ink.placeholder}
          keyboardType="numeric"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.holdInput}
          aria-label={label}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const PRIMARY_SHADOW = {
  shadowColor: accent.primary,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.3,
  shadowRadius: 14,
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
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
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.6 },
  headerSub: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  stepCount: { fontSize: 11.5, fontFamily: fonts.monoRegular, color: ink.muted, minWidth: 30, textAlign: 'right' },

  stepBar: { paddingHorizontal: 18, paddingBottom: 4 },
  bars: { flexDirection: 'row', gap: 6, marginTop: 4 },
  bar: { flex: 1, height: 3, borderRadius: 3, backgroundColor: glass.border2 },
  barOn: { backgroundColor: accent.primary },
  stepLabels: { flexDirection: 'row', marginTop: 2 },
  stepLabel: { flex: 1, minHeight: 34, justifyContent: 'center', alignItems: 'center' },
  stepLabelStart: { alignItems: 'flex-start' },
  stepLabelEnd: { alignItems: 'flex-end' },
  stepLabelText: { fontSize: 11.5, fontFamily: fonts.monoRegular, color: ink.muted },
  stepLabelTextOn: { fontFamily: fonts.mono, color: ink.primary },

  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28 },
  sectionSpacer: { marginTop: 24 },

  photoWrap: { alignItems: 'center', marginBottom: 4 },
  photoRing: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  photoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accent.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoCircleSet: { borderStyle: 'solid', borderColor: glass.border },
  photoImage: { width: 96, height: 96, borderRadius: 48 },
  photoEmoji: { fontSize: 44 },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sayHello: { fontSize: 19, fontFamily: fonts.medium, color: ink.primary, marginTop: 12, letterSpacing: -0.5 },
  photoActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderColor: accent.line,
  },
  photoBtnText: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },
  removePhotoBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 },
  removePhotoText: { fontSize: 13, fontFamily: fonts.medium, color: danger.primary },

  fieldLabel: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.25, marginTop: 20, marginBottom: 8 },
  fieldLabelSoft: { fontFamily: fonts.regular, color: ink.muted },
  input: {
    minHeight: 48,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: ink.primary,
  },
  inputFocused: { borderColor: accent.line },
  inputError: { borderColor: danger.primary },
  errorText: { fontSize: 12, fontFamily: fonts.regular, color: danger.primary, marginTop: 6, marginLeft: 2 },

  kindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fill,
  },
  kindChipOn: { backgroundColor: accent.soft, borderColor: accent.line },
  kindEmoji: { fontSize: 16 },
  kindText: { fontSize: 13, fontFamily: fonts.regular, color: ink.primary },
  kindTextOn: { fontFamily: fonts.medium, color: accent.ink },

  feedRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
  removeChip: {
    width: 34,
    height: 34,
    marginBottom: 5,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: 'transparent',
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },

  holdRow: { flexDirection: 'row', gap: 10 },
  holdTile: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.tile,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
  },
  holdLabel: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted },
  holdInput: { fontFamily: fonts.mono, fontSize: 17, color: ink.primary, padding: 0, marginTop: 4 },

  medRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  medNameInput: { flex: 1.4, minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
    ...PRIMARY_SHADOW,
  },
  primaryPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  primaryText: { flexShrink: 1, fontSize: 15, fontFamily: fonts.medium, color: accent.onAccent },
});
