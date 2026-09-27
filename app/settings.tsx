import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ink, line, space } from '../theme/colors';
import { type } from '../theme/fonts';
import {
  Banner,
  Button,
  Card,
  IconTile,
  ListRow,
  PetEmptyState,
  Pill,
  Screen,
  ScreenHeader,
  SectionLabel,
  TextField,
} from '../components/ui';
import { Toggle } from '../components/Toggle';
import { PetAvatar } from '../components/PetAvatar';
import { TimePickerField } from '../components/TimePickerField';
import { ConfirmDialog } from '../components/settings/ConfirmDialog';
import { usePets } from '../context/PetsContext';
import { useNotificationPrefs } from '../context/NotificationPrefsContext';
import { useSession } from '../context/SessionContext';
import { accountErrorMessage } from '../lib/auth/account';
import { parseClockTime } from '../lib/petSchedule';
import { joinNames, possessive } from '../lib/petVoice';

// TimePickerField speaks "h:mm AM/PM"; prefs store quiet hours as "HH:MM" 24h.
function to24h(display: string): string | null {
  const parsed = parseClockTime(display, new Date());
  if (!parsed) return null;
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}
function to12h(stored: string | null): string {
  if (!stored) return '';
  const parsed = parseClockTime(stored, new Date());
  if (!parsed) return '';
  const h = parsed.getHours();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(parsed.getMinutes()).padStart(2, '0')} ${period}`;
}

/**
 * SETTINGS — grouped and scannable:
 *   1. Quiet hours       (overnight pause, with a clear On / Off status)
 *   2. Reminders by pet  (one row per pet with their photo and a toggle)
 *   3. Your account      (synced only: back up with email)
 *   4. Switch account    (synced only: separated, and confirmed in a dialog)
 *
 * Presentation-only redesign: same prefs reads/writes, same account calls, same back
 * behaviour.
 */
export default function SettingsScreen() {
  const { pets } = usePets();
  const { prefs, setQuietHours, setPetMuted } = useNotificationPrefs();

  const muted = new Set(prefs.mutedPetIds);
  const quietStart = to12h(prefs.quietHoursStart);
  const quietEnd = to12h(prefs.quietHoursEnd);
  const quietOn = !!quietStart && !!quietEnd;
  const petNames = pets.length > 0 && pets.length <= 3 ? joinNames(pets.map((p) => p.name)) : null;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Settings"
          subtitle={petNames ? `Reminders and account for ${petNames}` : 'Reminders and account'}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
      }
    >
      {/* ── Quiet hours ─────────────────────────────────────────────── */}
      <SectionLabel hint="A calm night for you and your pets.">Quiet hours</SectionLabel>
      <Card padded>
        <View style={styles.qhTop}>
          <IconTile icon="moon" tone="neutral" size={44} />
          <View style={styles.flex}>
            <View style={styles.qhTitleRow}>
              <Text style={styles.cardTitle}>Pause overnight</Text>
              {quietOn ? (
                <Pill tone="pet" icon="check" label="On" size="sm" />
              ) : (
                <Pill tone="neutral" label="Off" size="sm" />
              )}
            </View>
            <Text style={styles.cardBody}>
              {quietOn
                ? `Potty and meal nudges pause from ${quietStart} to ${quietEnd}.`
                : 'Pick a start and end time to pause potty and meal nudges.'}
            </Text>
          </View>
        </View>
        <View style={styles.qhRow}>
          <TimePickerField
            label="From"
            value={quietStart}
            onChange={(v) => setQuietHours(v ? to24h(v) : null, prefs.quietHoursEnd)}
            placeholder="Start"
            defaultTime="9:00 PM"
            style={{ flex: 1 }}
          />
          <TimePickerField
            label="Until"
            value={quietEnd}
            onChange={(v) => setQuietHours(prefs.quietHoursStart, v ? to24h(v) : null)}
            placeholder="End"
            defaultTime="7:00 AM"
            style={{ flex: 1 }}
          />
        </View>
        <View style={styles.note}>
          <IconTile icon="pill" tone="med" size={32} />
          <Text style={styles.noteText}>Meds and appointment reminders always come through.</Text>
        </View>
      </Card>

      {/* ── Per-pet reminders ───────────────────────────────────────── */}
      <View style={styles.gap} />
      <SectionLabel hint="Turn one off to pause every reminder for that pet.">
        Reminders for each pet
      </SectionLabel>
      {pets.length === 0 ? (
        <PetEmptyState
          variant="card"
          icon="paw"
          title="Let's meet your pet"
          body="Add your first pet and you can choose which reminders they get."
          action={{ label: 'Add your first pet', icon: 'plus', onPress: () => router.push('/add-pet') }}
        />
      ) : (
        <Card>
          {pets.map((pet, i) => {
            const enabled = !muted.has(pet.id);
            return (
              <ListRow
                key={pet.id}
                leading={<PetAvatar pet={pet} size={44} ring />}
                title={pet.name}
                subtitle={enabled ? `Getting ${possessive(pet.name)} reminders` : 'Reminders paused'}
                right={
                  <Toggle
                    on={enabled}
                    onToggle={() => setPetMuted(pet.id, enabled)}
                    aria-label={`Reminders for ${pet.name}`}
                  />
                }
                showChevron={false}
                divider={i < pets.length - 1}
              />
            );
          })}
        </Card>
      )}

      {/* ACCOUNT. Renders nothing in local mode — there's no server account to secure. */}
      <AccountSection />
    </Screen>
  );
}

/**
 * ACCOUNTS ("Option 1"): keep the anonymous default, add opt-in email securing + recovery.
 *
 * Renders nothing in local mode (there is no server account). In synced mode:
 *  - Anonymous → a prompt to attach an email ("Secure account"), then a "check your email"
 *    pending state.
 *  - Permanent → "Secured as {email}."
 * Plus a secondary, confirm-gated "Sign in with email" for recovering an existing account
 * onto this device (which switches away from the data currently here). It lives in its own
 * "Switch account" group so it's never mistaken for the everyday action.
 */
function AccountSection() {
  const { synced, isAnonymous, email, secureAccount, signInWithEmail } = useSession();

  const [emailInput, setEmailInput] = useState('');
  const [securing, setSecuring] = useState(false);
  const [pending, setPending] = useState<string | null>(null); // email we sent confirmation to
  const [error, setError] = useState<string | null>(null);

  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoverSent, setRecoverSent] = useState<string | null>(null);
  const [recoverError, setRecoverError] = useState<string | null>(null);

  if (!synced) return null;

  const submitSecure = async () => {
    setSecuring(true);
    setError(null);
    try {
      await secureAccount(emailInput);
      setPending(emailInput.trim());
      setEmailInput('');
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setSecuring(false);
    }
  };

  const submitRecover = async () => {
    setRecovering(true);
    setRecoverError(null);
    try {
      await signInWithEmail(recoverEmail);
      setRecoverSent(recoverEmail.trim());
      setRecoverOpen(false);
      setRecoverEmail('');
    } catch (e) {
      setRecoverError(accountErrorMessage(e));
    } finally {
      setRecovering(false);
    }
  };

  return (
    <>
      <View style={styles.gap} />
      <SectionLabel>Your account</SectionLabel>

      {isAnonymous ? (
        pending ? (
          <Card padded tone="pet">
            <View style={styles.qhTop}>
              <IconTile icon="mail" tone="pet" size={44} bg="rgba(255,255,255,0.7)" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Check your email</Text>
                <Text style={styles.cardBody}>
                  We sent a link to {pending}. Open it on this phone to finish. Your pets and
                  history stay exactly as they are.
                </Text>
              </View>
            </View>
            <Button
              label="Use a different email"
              variant="ghost"
              size="md"
              onPress={() => setPending(null)}
              style={styles.topGap}
            />
          </Card>
        ) : (
          <Card padded>
            <View style={styles.qhTop}>
              <IconTile icon="lock" tone="attention" size={44} />
              <View style={styles.flex}>
                <View style={styles.qhTitleRow}>
                  <Text style={styles.cardTitle}>Keep your history safe</Text>
                  <Pill tone="attention" label="Not backed up" size="sm" />
                </View>
                <Text style={styles.cardBody}>
                  Add your email so your pets&apos; history is never lost, even on a new phone.
                </Text>
              </View>
            </View>
            <TextField
              label="Email"
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              accessibilityLabel="Email address"
              error={error}
              containerStyle={styles.fieldGap}
            />
            <Button
              label="Secure account"
              icon="lock"
              onPress={() => void submitSecure()}
              disabled={!emailInput.trim()}
              loading={securing}
              fullWidth
              style={styles.topGap}
            />
          </Card>
        )
      ) : (
        <Card padded>
          <View style={styles.qhTop}>
            <IconTile icon="lock" tone="pet" size={44} />
            <View style={styles.flex}>
              <View style={styles.qhTitleRow}>
                <Text style={styles.cardTitle}>Backed up</Text>
                <Pill tone="pet" icon="check" label="Secured" size="sm" />
              </View>
              <Text style={styles.cardBody}>
                Signed in as {email ?? 'your email'}. On a new phone, sign in with this email to
                pick up where you left off.
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* ── Switch account (separated + confirmed) ──────────────────── */}
      <View style={styles.gap} />
      <SectionLabel hint="Only if you already have a PawClock account.">Switch account</SectionLabel>
      {recoverSent ? (
        <Banner
          tone="pet"
          icon="mail"
          title="Check your email"
          body={`We sent a sign-in link to ${recoverSent}.`}
        />
      ) : (
        <Card>
          <ListRow
            icon="mail"
            tone="vet"
            title="Sign in with email"
            subtitle="Move an existing account onto this phone."
            onPress={() => {
              setRecoverError(null);
              setRecoverOpen(true);
            }}
            accessibilityLabel="Sign in with email"
          />
        </Card>
      )}

      <ConfirmDialog
        visible={recoverOpen}
        onClose={() => setRecoverOpen(false)}
        icon="mail"
        tone="attention"
        title="Sign in with email"
        body="This phone will switch to that account. The pets and logs here now will stop showing (they stay safe in their own account). We'll email you a sign-in link."
        confirmLabel="Send link"
        confirmAccessibilityLabel="Send sign-in link"
        onConfirm={() => void submitRecover()}
        confirmDisabled={!recoverEmail.trim()}
        loading={recovering}
        cancelLabel="Cancel"
      >
        <TextField
          label="Email"
          value={recoverEmail}
          onChangeText={setRecoverEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
          accessibilityLabel="Email address"
          error={recoverError}
        />
      </ConfirmDialog>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { height: space.section },
  topGap: { marginTop: space.md },
  fieldGap: { marginTop: space.lg },

  cardTitle: { ...type.subhead, color: ink.primary },
  cardBody: { ...type.bodySm, color: ink.muted, marginTop: 4 },

  // Quiet hours
  qhTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  qhTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  qhRow: { flexDirection: 'row', gap: space.xs, marginTop: space.lg },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: line.hairline,
  },
  noteText: { ...type.bodySm, color: ink.muted, flex: 1 },
});
