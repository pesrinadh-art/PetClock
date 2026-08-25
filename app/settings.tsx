import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface, ink, line, green, amber, terracotta, category, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from '../components/Icon';
import { Card, SectionLabel, Pill } from '../components/ui';
import { Toggle } from '../components/Toggle';
import { PetAvatar } from '../components/PetAvatar';
import { TimePickerField } from '../components/TimePickerField';
import { AppModal } from '../components/AppModal';
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          role="button"
          aria-label="Back"
          hitSlop={8}
        >
          <Icon name="chevronLeft" size={16} color={ink.primary} strokeWidth={2.3} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Quiet hours */}
        <SectionLabel>Quiet hours</SectionLabel>
        <Card padded>
          <View style={styles.qhTop}>
            <View style={styles.qhIcon}>
              <Icon name="moon" size={16} color={category.dinnerInk} strokeWidth={2} />
            </View>
            <Text style={styles.qhDesc}>
              Pauses potty and meal reminders overnight. Medication and appointments still come
              through. Set both a start and end to turn it on.
            </Text>
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
        </Card>

        {/* Per-pet notifications */}
        <SectionLabel style={styles.sectionSpacer}>Per-pet notifications</SectionLabel>
        {pets.length === 0 ? (
          <Text style={styles.helperText}>Add a pet to manage its reminders.</Text>
        ) : (
          <Card>
            {pets.map((pet, i) => {
              const enabled = !muted.has(pet.id);
              return (
                <View key={pet.id}>
                  <View style={styles.muteRow}>
                    <PetAvatar pet={pet} size={34} emojiSize={20} style={styles.muteAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.muteName} numberOfLines={1}>
                        {pet.name}
                      </Text>
                      <Text style={styles.muteSub}>{enabled ? 'Reminders on' : 'Muted'}</Text>
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
    </SafeAreaView>
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
              bg={amber.warnBg}
              color={amber.warnInk}
              size="sm"
              icon={<Icon name="alert" size={11} color={amber.warnInk} strokeWidth={2.4} />}
            />
            <Text style={[accountStyles.cardBody, accountStyles.cardBodyTop]}>
              You’re signed in anonymously — add an email so you never lose your pets’ history.
            </Text>
            <TextInput
              style={accountStyles.input}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={ink.faint2}
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
                  <Icon name="lock" size={15} color={ink.onDark} strokeWidth={2.2} />
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
            bg={green.tint}
            color={green.primary}
            size="sm"
            icon={<Icon name="lock" size={11} color={green.primary} strokeWidth={2.4} />}
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
            <View style={[styles.dataIcon, { backgroundColor: category.medBg }]}>
              <Icon name="mail" size={16} color={category.medInk} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dataLabel}>Sign in with email</Text>
              <Text style={styles.dataSub}>Recover an existing account onto this device.</Text>
            </View>
            <Icon name="chevronRight" size={15} color="#c0b8a8" strokeWidth={2.3} />
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
              placeholderTextColor={ink.faint2}
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
                  <ActivityIndicator color={ink.onDark} />
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
  cardTitle: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary, marginBottom: 6 },
  cardBody: { fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted, lineHeight: 19, marginBottom: 12 },
  cardBodyTop: { marginTop: 9 },
  input: {
    backgroundColor: surface.field,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: ink.primary,
    marginBottom: 10,
  },
  errorText: { fontSize: 12, fontFamily: fonts.semiBold, color: terracotta.primary, lineHeight: 17, marginBottom: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: green.mid,
    borderRadius: radius.tile,
    paddingVertical: 13,
  },
  primaryBtnText: { fontSize: 14, fontFamily: fonts.bold, color: ink.onDark },
  linkText: { fontSize: 13, fontFamily: fonts.bold, color: green.primary },
  message: { fontSize: 12, fontFamily: fonts.medium, color: green.primary, lineHeight: 17, marginTop: 8, paddingHorizontal: 2 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: { fontSize: 19, fontFamily: fonts.black, color: ink.primary, letterSpacing: -0.4 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: surface.chipAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  rowPressed: { opacity: 0.6 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionSpacer: { marginTop: 20 },
  helperText: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, lineHeight: 17 },

  // Quiet hours
  qhTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  qhIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    backgroundColor: category.dinnerBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qhDesc: { flex: 1, fontSize: 12.5, fontFamily: fonts.medium, color: ink.muted, lineHeight: 18 },
  qhRow: { flexDirection: 'row', gap: 8, marginTop: 13 },

  // Per-pet mute rows
  muteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  muteAvatar: { backgroundColor: 'transparent' },
  muteName: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  muteSub: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 16 },

  // Generic action rows (data, recover)
  rowCardSpacer: { marginTop: 8 },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  dataIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dataLabel: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  dataSub: { fontSize: 12, fontFamily: fonts.medium, color: ink.muted, marginTop: 2, lineHeight: 16 },

  // Dialogs
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(42,39,36,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: surface.card,
    borderRadius: radius.sheet,
    padding: 20,
    ...shadow.card,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.bold, color: ink.primary, marginBottom: 8 },
  dialogBody: { fontSize: 13, fontFamily: fonts.medium, color: ink.muted, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.tile, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: surface.field },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.bold, color: ink.muted },
  confirmBtn: { backgroundColor: green.mid },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.bold, color: ink.onDark },
});
