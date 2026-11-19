import { useState } from 'react';
import { possessive } from '../lib/petVoice';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { accent, danger, glass, ink, radius, shadow, surface, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from '../components/Icon';
import { Card, Screen, SectionLabel, Pill } from '../components/ui';
import { Toggle } from '../components/Toggle';
import { PetAvatar } from '../components/PetAvatar';
import { TimePickerField } from '../components/TimePickerField';
import { AppModal } from '../components/AppModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { joinPetNames } from '../lib/petNames';
import { usePets } from '../context/PetsContext';
import { useNotificationPrefs } from '../context/NotificationPrefsContext';
import { useSession } from '../context/SessionContext';
import { accountErrorMessage } from '../lib/auth/account';
import { parseClockTime } from '../lib/petSchedule';

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

export default function SettingsScreen() {
  const { pets } = usePets();
  const { prefs, setQuietHours, setPetMuted } = useNotificationPrefs();

  const muted = new Set(prefs.mutedPetIds);
  const quietOn = !!prefs.quietHoursStart && !!prefs.quietHoursEnd;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader
        title="Settings"
        subtitle={pets.length > 0 ? `Reminders and account for ${joinPetNames(pets.map((p) => p.name))}` : 'Reminders and account'}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Quiet hours */}
        <SectionLabel sub="A calm night for you and your pets.">Quiet hours</SectionLabel>
        <Card padded>
          <View style={styles.qhTop}>
            <View style={styles.qhIcon}>
              <Icon name="moon" size={17} color={accent.ink} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.qhTitleRow}>
                <Text style={styles.qhTitle}>Pause overnight</Text>
                <Pill
                  label={quietOn ? 'On' : 'Off'}
                  bg={quietOn ? accent.soft : 'transparent'}
                  color={quietOn ? accent.ink : ink.muted}
                  size="sm"
                  style={{ borderWidth: 1, borderColor: quietOn ? accent.line : glass.border2 }}
                />
              </View>
              <Text style={styles.qhDesc}>Pick a start and end time to pause potty and meal nudges.</Text>
            </View>
          </View>
          <View style={styles.qhRow}>
            <TimePickerField
              label="From"
              value={to12h(prefs.quietHoursStart)}
              onChange={(v) => setQuietHours(v ? to24h(v) : null, prefs.quietHoursEnd)}
              placeholder="Start"
              defaultTime="9:00 PM"
              style={{ flex: 1 }}
            />
            <TimePickerField
              label="Until"
              value={to12h(prefs.quietHoursEnd)}
              onChange={(v) => setQuietHours(prefs.quietHoursStart, v ? to24h(v) : null)}
              placeholder="End"
              defaultTime="7:00 AM"
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.qhNote}>
            <View style={styles.qhNoteIcon}>
              <Icon name="pill" size={15} color={accent.ink} strokeWidth={1.8} />
            </View>
            <Text style={styles.qhNoteText}>Meds and appointment reminders always come through.</Text>
          </View>
        </Card>

        {/* Per-pet notifications */}
        <SectionLabel style={styles.sectionSpacer} sub="Turn one off to pause every reminder for that pet.">
          Reminders for each pet
        </SectionLabel>
        {pets.length === 0 ? (
          <Text style={styles.helperText}>Add a pet to manage its reminders.</Text>
        ) : (
          <Card>
            {pets.map((pet, i) => {
              const enabled = !muted.has(pet.id);
              return (
                <View key={pet.id}>
                  <View style={styles.muteRow}>
                    <PetAvatar pet={pet} size={40} emojiSize={21} style={styles.muteAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.muteName} numberOfLines={1}>
                        {pet.name}
                      </Text>
                      <Text style={styles.muteSub}>{enabled ? `Getting ${possessive(pet.name)} reminders` : 'Paused'}</Text>
                    </View>
                    <Toggle
                      on={enabled}
                      onToggle={() => setPetMuted(pet.id, enabled)}
                      aria-label={`Reminders for ${pet.name}`}
                    />
                  </View>
                  {i < pets.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </Card>
        )}

        {/* ACCOUNTS. Renders nothing in local mode — there's no server account to secure. */}
        <AccountSection />
      </ScrollView>
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
 * onto this device (which switches away from the data currently here).
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
      <SectionLabel style={styles.sectionSpacer}>Account</SectionLabel>

      {isAnonymous ? (
        pending ? (
          <Card padded>
            <Text style={accountStyles.cardTitle}>Check your email</Text>
            <Text style={accountStyles.cardBody}>
              We sent a confirmation link to {pending}. Open it on this device to finish
              securing your account — your pets and history stay exactly as they are.
            </Text>
            <Pressable
              onPress={() => setPending(null)}
              role="button"
              aria-label="Use a different email"
              style={({ pressed }) => [pressed && accountStyles.pressed]}
            >
              <Text style={accountStyles.linkText}>Use a different email</Text>
            </Pressable>
          </Card>
        ) : (
          <Card padded>
            <Pill
              label="Not secured"
              bg={warn.soft}
              color={warn.ink}
              size="sm"
              style={{ borderWidth: 1, borderColor: warn.line }}
              icon={<Icon name="alert" size={11} color={warn.ink} strokeWidth={2} />}
            />
            <Text style={[accountStyles.cardBody, accountStyles.cardBodyTop]}>
              You’re signed in anonymously — add an email so you never lose your pets’ history.
            </Text>
            <TextInput
              style={accountStyles.input}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={ink.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              accessibilityLabel="Email address"
            />
            {error ? <Text style={accountStyles.errorText}>{error}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                accountStyles.primaryBtn,
                (!emailInput.trim() || securing) && accountStyles.disabled,
                pressed && accountStyles.pressed,
              ]}
              onPress={() => void submitSecure()}
              disabled={!emailInput.trim() || securing}
              role="button"
              aria-label="Secure account"
            >
              {securing ? (
                <ActivityIndicator color={ink.onDark} />
              ) : (
                <>
                  <Icon name="lock" size={15} color={accent.onAccent} strokeWidth={1.8} />
                  <Text style={accountStyles.primaryBtnText}>Secure account</Text>
                </>
              )}
            </Pressable>
          </Card>
        )
      ) : (
        <Card padded>
          <Pill
            label="Secured"
            bg={accent.soft}
            color={accent.ink}
            size="sm"
            style={{ borderWidth: 1, borderColor: accent.line }}
            icon={<Icon name="lock" size={11} color={accent.ink} strokeWidth={2} />}
          />
          <Text style={[accountStyles.cardBody, accountStyles.cardBodyTop]}>
            Secured as {email ?? 'your email'}. Your history is recoverable — sign in with this
            email on a new phone to pick up where you left off.
          </Text>
        </Card>
      )}

      {recoverSent ? (
        <Text style={accountStyles.message}>
          Check your email — we sent a sign-in link to {recoverSent}.
        </Text>
      ) : (
        <Card style={styles.rowCardSpacer}>
          <Pressable
            style={({ pressed }) => [styles.dataRow, pressed && styles.rowPressed]}
            onPress={() => {
              setRecoverError(null);
              setRecoverOpen(true);
            }}
            role="button"
            aria-label="Sign in with email"
          >
            <View style={styles.dataIcon}>
              <Icon name="mail" size={17} color={accent.ink} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dataLabel}>Sign in with email</Text>
              <Text style={styles.dataSub}>Recover an existing account onto this device.</Text>
            </View>
            <Icon name="chevronRight" size={15} color={ink.placeholder} strokeWidth={2} />
          </Pressable>
        </Card>
      )}

      <AppModal
        visible={recoverOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoverOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setRecoverOpen(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Sign in with email</Text>
            <Text style={styles.dialogBody}>
              This switches this device to the account for that email. The pets, logs and
              history currently on this device will no longer show here (they stay in their own
              account). We’ll email you a sign-in link.
            </Text>
            <TextInput
              style={accountStyles.input}
              value={recoverEmail}
              onChangeText={setRecoverEmail}
              placeholder="you@example.com"
              placeholderTextColor={ink.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              accessibilityLabel="Email address"
            />
            {recoverError ? <Text style={accountStyles.errorText}>{recoverError}</Text> : null}
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setRecoverOpen(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogBtn,
                  styles.confirmBtn,
                  (!recoverEmail.trim() || recovering) && accountStyles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => void submitRecover()}
                disabled={!recoverEmail.trim() || recovering}
                role="button"
                aria-label="Send sign-in link"
              >
                {recovering ? (
                  <ActivityIndicator color={accent.onAccent} />
                ) : (
                  <Text style={styles.confirmBtnText}>Send link</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

const accountStyles = StyleSheet.create({
  cardTitle: { fontSize: 15, fontFamily: fonts.medium, letterSpacing: -0.2, color: ink.primary, marginBottom: 6 },
  cardBody: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, lineHeight: 19.5, marginBottom: 12 },
  cardBodyTop: { marginTop: 10 },
  input: {
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border2,
    borderRadius: radius.tile,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: ink.primary,
    marginBottom: 10,
  },
  errorText: { fontSize: 12.5, fontFamily: fonts.regular, color: danger.primary, lineHeight: 17, marginBottom: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: accent.primary,
    borderRadius: radius.pill,
    minHeight: 46,
    shadowColor: accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 14.5, fontFamily: fonts.medium, color: accent.onAccent },
  linkText: { fontSize: 13.5, fontFamily: fonts.medium, color: accent.ink },
  message: { fontSize: 13, fontFamily: fonts.regular, color: accent.ink, lineHeight: 18, marginTop: 10, paddingHorizontal: 2 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  rowPressed: { opacity: 0.6 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
  sectionSpacer: { marginTop: 24 },
  helperText: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, lineHeight: 18 },

  // Quiet hours
  qhTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  qhIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qhTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qhTitle: { fontSize: 14.5, fontFamily: fonts.medium, color: ink.primary },
  qhDesc: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, lineHeight: 18.5, marginTop: 3 },
  qhRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  qhNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: glass.border,
  },
  qhNoteIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qhNoteText: { flex: 1, fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 18 },

  // Per-pet mute rows
  muteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
  muteAvatar: { backgroundColor: accent.soft, borderWidth: 1, borderColor: accent.line },
  muteName: { fontSize: 14.5, fontFamily: fonts.medium, color: ink.primary },
  muteSub: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: glass.border, marginLeft: 66, marginRight: 14 },

  // Generic action rows (recover)
  rowCardSpacer: { marginTop: 10 },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14 },
  dataIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dataLabel: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  dataSub: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 2, lineHeight: 16 },

  // Dialogs
  overlay: {
    flex: 1,
    backgroundColor: glass.scrimDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: surface.solid,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: glass.border,
    padding: 22,
    ...shadow.hero,
  },
  dialogTitle: { fontSize: 18, fontFamily: fonts.medium, letterSpacing: -0.45, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 20, marginBottom: 16 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  dialogBtn: { flex: 1, borderRadius: radius.pill, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: glass.strong, borderWidth: 1, borderColor: glass.border2 },
  cancelBtnText: { fontSize: 14, fontFamily: fonts.medium, color: ink.primary },
  confirmBtn: { backgroundColor: accent.primary },
  confirmBtnText: { fontSize: 14, fontFamily: fonts.medium, color: accent.onAccent },
});