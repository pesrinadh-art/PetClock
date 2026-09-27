import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { amber, green, ink, line, radius, shadow, space, surface } from '../theme/colors';
import { fonts, type } from '../theme/fonts';
import { TimePickerField } from '../components/TimePickerField';
import { usePets } from '../context/PetsContext';
import { BreedAutocomplete } from '../components/BreedAutocomplete';
import { completeOnboarding } from '../lib/onboarding';
import { requestNotificationPermission } from '../lib/notifications/permissions';
import { to24h } from '../lib/petFormTime';
import { Icon } from '../components/Icon';
import { Button, ChoiceChip, ChoiceChipRow, IconButton, IconTile, StickyFooter, TextField } from '../components/ui';
import { BrandMark, FormCard, StepProgress, ValueRow, Wordmark } from '../components/onboarding/OnboardingKit';
import { possessive, pottyBreakPhrase, speciesCheer } from '../lib/petVoice';

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

// Presentation only: species-aware breed placeholder examples.
const BREED_EXAMPLES: Record<string, string> = {
  dog: 'e.g. Beagle',
  cat: 'e.g. Siamese',
  rabbit: 'e.g. Holland Lop',
  hamster: 'e.g. Syrian',
  bird: 'e.g. Budgie',
  turtle: 'e.g. Red-eared slider',
  snake: 'e.g. Ball python',
  fish: 'e.g. Betta',
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
      setNameError('What should we call your pet? Add a name to continue.');
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

  // ── Presentation-only derived copy (from what the owner has typed/picked) ──
  const petName = name.trim();
  const speciesLabelText = AVATAR_LABELS[avatar] ?? 'Pet';
  const speciesKey = speciesLabelText.toLowerCase();
  const displayName = petName || 'your pet';

  const footer =
    step === 'welcome' ? (
      <>
        <Button label="Let's meet your pet" iconRight="arrowRight" fullWidth onPress={() => setStep('pet')} />
        <Text style={styles.footerNote}>Takes less than a minute</Text>
      </>
    ) : step === 'pet' ? (
      <Button
        label={petName ? `Save ${petName}` : 'Save your pet'}
        icon="check"
        fullWidth
        onPress={savePet}
      />
    ) : (
      <>
        <Button label="Turn on reminders" icon="bell" fullWidth onPress={() => void enableNotifications()} />
        <Button label="Maybe later" variant="ghost" size="md" fullWidth onPress={() => void finish()} />
      </>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, step !== 'pet' && styles.contentCentered]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'welcome' && (
            <View style={styles.welcomeWrap}>
              <View style={styles.brandBlock}>
                <BrandMark size={84} />
                <Wordmark />
              </View>

              <View style={styles.headlineBlock}>
                <Text style={styles.welcomeTitle} role="heading">
                  Never miss a potty break again
                </Text>
                <Text style={styles.welcomeBody}>
                  PawClock learns your pet&apos;s rhythm and gives you a gentle nudge at just the right time.
                </Text>
              </View>

              <FormCard style={styles.valueCard}>
                <ValueRow
                  icon="drop"
                  tone="pee"
                  title="Potty breaks, predicted"
                  body="A heads-up before they need to go."
                />
                <View style={styles.hairline} />
                <ValueRow icon="bowl" tone="food" title="Meals on time" body="Log breakfast and dinner in one tap." />
                <View style={styles.hairline} />
                <ValueRow icon="pill" tone="med" title="Meds and vet visits" body="Friendly reminders, so nothing slips." />
              </FormCard>
            </View>
          )}

          {step === 'pet' && (
            <View style={styles.stepWrap}>
              <StepProgress step={1} total={2} caption="About your pet" />

              {/* Live preview: the pet becomes the hero as soon as it has a name. */}
              <View style={styles.previewBlock}>
                <View style={styles.previewAvatar} aria-label={`${speciesLabelText} avatar`} role="img">
                  <Text style={styles.previewEmoji}>{avatar}</Text>
                </View>
                <Text style={styles.stepTitle} role="heading">
                  {petName ? `Hi, ${petName}!` : "Who's joining PawClock?"}
                </Text>
                <Text style={styles.stepBody}>
                  {petName
                    ? `Tell us a little about ${petName}. You can change anything later.`
                    : 'Start with your first pet. You can add more pets later.'}
                </Text>
              </View>

              <FormCard>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>What kind of pet?</Text>
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
                </View>

                <TextField
                  label={petName ? `${possessive(petName)} name` : "Your pet's name"}
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    if (nameError) setNameError(undefined);
                  }}
                  placeholder="e.g. Biscuit"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  error={nameError}
                  hint={nameError ? undefined : "This is how we'll greet them every day."}
                />

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Breed <Text style={styles.optional}>(optional)</Text>
                  </Text>
                  <BreedAutocomplete
                    value={breed}
                    onChange={setBreed}
                    placeholder={BREED_EXAMPLES[speciesKey] ?? 'e.g. Beagle'}
                    species={AVATAR_LABELS[avatar]}
                  />
                </View>
              </FormCard>

              <FormCard>
                <View>
                  <Text style={styles.cardHeading}>{petName ? `${possessive(petName)} routine` : 'Their routine'}</Text>
                  <Text style={styles.cardHint}>Optional. Add these now, or any time from {petName ? possessive(petName) : 'their'} profile.</Text>
                </View>

                {/* Meal times */}
                <View style={styles.subGroup}>
                  <View style={styles.subHeader}>
                    <IconTile icon="bowl" tone="food" size={36} />
                    <Text style={styles.subTitle}>Meal times</Text>
                  </View>
                  {feedRows.map((row, i) => (
                    <View key={row.rowId} style={styles.scheduleRow}>
                      <TimePickerField
                        value={row.time}
                        onChange={(v) => updateFeedRow(row.rowId, v)}
                        placeholder={`Meal ${i + 1} time`}
                        style={styles.rowFlex}
                      />
                      <IconButton
                        icon="close"
                        accessibilityLabel={`Remove feed time ${i + 1}`}
                        onPress={() => removeFeedRow(row.rowId)}
                      />
                    </View>
                  ))}
                  {feedRows.length < MAX_FEED_TIMES && (
                    <Button
                      label={feedRows.length === 0 ? 'Add a meal time' : 'Add another meal'}
                      accessibilityLabel="Add feed time"
                      icon="plus"
                      variant="soft"
                      tone="food"
                      size="md"
                      fullWidth
                      onPress={addFeedRow}
                    />
                  )}
                </View>

                <View style={styles.hairline} />

                {/* Medications */}
                <View style={styles.subGroup}>
                  <View style={styles.subHeader}>
                    <IconTile icon="pill" tone="med" size={36} />
                    <Text style={styles.subTitle}>Medications</Text>
                  </View>
                  {medications.map((med, i) => (
                    <View key={med.rowId} style={styles.medCard}>
                      <TextField
                        value={med.name}
                        onChangeText={(v) => updateMedicationRow(med.rowId, 'name', v)}
                        placeholder="Medicine name"
                        aria-label={`Medicine ${i + 1} name`}
                      />
                      <View style={styles.scheduleRow}>
                        <TimePickerField
                          value={med.time}
                          onChange={(v) => updateMedicationRow(med.rowId, 'time', v)}
                          placeholder="What time?"
                          style={styles.rowFlex}
                        />
                        <IconButton
                          icon="close"
                          accessibilityLabel={med.name.trim() ? `Remove ${med.name.trim()}` : 'Remove medication'}
                          onPress={() => removeMedicationRow(med.rowId)}
                        />
                      </View>
                    </View>
                  ))}
                  {medications.length < MAX_MEDICATIONS && (
                    <Button
                      label={medications.length === 0 ? 'Add a medication' : 'Add another medication'}
                      accessibilityLabel="Add medication"
                      icon="plus"
                      variant="soft"
                      tone="med"
                      size="md"
                      fullWidth
                      onPress={addMedicationRow}
                    />
                  )}
                </View>
              </FormCard>
            </View>
          )}

          {step === 'notify' && (
            <View style={styles.stepWrap}>
              <StepProgress step={2} total={2} caption="Reminders" />

              <View style={styles.previewBlock}>
                <View style={styles.previewAvatarWrap}>
                  <View style={styles.previewAvatar} aria-label={`${displayName} avatar`} role="img">
                    <Text style={styles.previewEmoji}>{avatar}</Text>
                  </View>
                  <View style={styles.bellBadge}>
                    <Icon name="bell" size={16} color={amber.warnInk} strokeWidth={2.3} />
                  </View>
                </View>
                <View style={styles.cheerPill}>
                  <Icon name="sparkle" size={14} color={green.primary} strokeWidth={2.2} />
                  <Text style={styles.cheerText}>{speciesCheer(speciesKey)}</Text>
                </View>
                <Text style={styles.stepTitle} role="heading">
                  {petName ? `${petName} is all set!` : "You're all set!"}
                </Text>
                <Text style={styles.stepBody}>
                  Want a gentle nudge when it&apos;s time for {possessive(petName)} {pottyBreakPhrase(speciesKey)}, meals
                  or meds? It works even when the app is closed.
                </Text>
              </View>

              {/* Sample of what a nudge looks like — illustrative only. */}
              <View style={styles.sampleWrap}>
                <Text style={styles.sampleCaption}>Here&apos;s what a nudge looks like</Text>
                <View style={styles.sampleCard} aria-label="Example reminder" role="img">
                  <View style={styles.sampleIcon}>
                    <Icon name="paw" size={18} color={ink.onDark} strokeWidth={2.2} />
                  </View>
                  <View style={styles.sampleText}>
                    <View style={styles.sampleTop}>
                      <Text style={styles.sampleApp}>PawClock</Text>
                      <Text style={styles.sampleWhen}>now</Text>
                    </View>
                    <Text style={styles.sampleTitle} numberOfLines={1}>
                      Time for {possessive(petName)} {pottyBreakPhrase(speciesKey)}
                    </Text>
                    <Text style={styles.sampleBody} numberOfLines={1}>
                      Tap to log it in one go.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
        <StickyFooter>{footer}</StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.xxl },
  contentCentered: { justifyContent: 'center' },

  // Welcome
  welcomeWrap: { gap: space.section },
  brandBlock: { alignItems: 'center', gap: space.sm },
  headlineBlock: { gap: space.xs },
  welcomeTitle: { ...type.display, fontSize: 30, lineHeight: 35, color: ink.primary, textAlign: 'center' },
  welcomeBody: { ...type.body, fontSize: 16, lineHeight: 23, color: ink.muted, textAlign: 'center' },
  valueCard: { gap: space.md, padding: space.lg },
  hairline: { height: 1, backgroundColor: line.hairline },
  footerNote: { ...type.caption, color: ink.muted, textAlign: 'center', paddingBottom: 2 },

  // Steps
  stepWrap: { gap: space.xl },
  previewBlock: { alignItems: 'center', gap: space.xs, paddingTop: space.xs },
  previewAvatarWrap: { position: 'relative' },
  previewAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: green.tint,
    borderWidth: 5,
    borderColor: surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxs,
    ...shadow.card,
  },
  previewEmoji: { fontSize: 54 },
  bellBadge: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: amber.warnBg,
    borderWidth: 3,
    borderColor: surface.app,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cheerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: green.tint,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  cheerText: { ...type.caption, fontFamily: fonts.bold, color: green.primary },
  stepTitle: { ...type.display, color: ink.primary, textAlign: 'center' },
  stepBody: { ...type.body, color: ink.muted, textAlign: 'center', maxWidth: 340 },

  fieldGroup: { gap: space.xs },
  fieldLabel: { ...type.subhead, fontSize: 14.5, color: ink.primary },
  optional: { fontFamily: fonts.medium, color: ink.muted },
  chipEmoji: { fontSize: 20 },

  cardHeading: { ...type.heading, color: ink.primary },
  cardHint: { ...type.bodySm, color: ink.muted, marginTop: 2 },
  subGroup: { gap: space.sm },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  subTitle: { ...type.subhead, color: ink.primary },
  scheduleRow: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  rowFlex: { flex: 1 },
  medCard: {
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.tile,
    backgroundColor: surface.field,
  },

  // Sample notification
  sampleWrap: { gap: space.xs },
  sampleCaption: { ...type.caption, color: ink.muted, textAlign: 'center' },
  sampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: space.md,
    borderWidth: 1,
    borderColor: line.border,
    ...shadow.card,
  },
  sampleIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: green.mid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleText: { flex: 1, minWidth: 0 },
  sampleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sampleApp: { ...type.caption, fontFamily: fonts.bold, color: ink.muted },
  sampleWhen: { ...type.caption, color: ink.muted },
  sampleTitle: { ...type.subhead, color: ink.primary, marginTop: 1 },
  sampleBody: { ...type.bodySm, color: ink.muted },
});
