import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { SectionTitle } from '../components/SectionTitle';
import { PetAvatar } from '../components/PetAvatar';
import { TimePickerField } from '../components/TimePickerField';
import { AppModal } from '../components/AppModal';
import { HouseholdSection } from '../components/HouseholdSection';
import { usePets } from '../context/PetsContext';
import { useNotificationPrefs } from '../context/NotificationPrefsContext';
import { useSession } from '../context/SessionContext';
import { accountErrorMessage } from '../lib/auth/account';
import { cancelAllOurNotifications } from '../lib/notifications/scheduler';
import { loadDemoData, resetAll } from '../lib/repo/types';
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);

  const muted = new Set(prefs.mutedPetIds);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          role="button"
          aria-label="Back"
          hitSlop={8}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <SectionTitle>Quiet Hours</SectionTitle>
        <Text style={styles.helperText}>
          Pause potty-break and meal reminders overnight. Medication and appointment reminders still
          come through. Set both a start and end to turn it on.
        </Text>
        <View style={styles.row2}>
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

        <SectionTitle>Per-pet Notifications</SectionTitle>
        {pets.length === 0 ? (
          <Text style={styles.helperText}>Add a pet to manage its reminders.</Text>
        ) : (
          pets.map((pet) => {
            const enabled = !muted.has(pet.id);
            return (
              <View key={pet.id} style={styles.muteRow}>
                <PetAvatar pet={pet} size={36} emojiSize={24} style={styles.muteAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.muteName}>{pet.name}</Text>
                  <Text style={styles.muteSub}>{enabled ? 'Reminders on' : 'Muted'}</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(next) => setPetMuted(pet.id, !next)}
                  trackColor={{ true: colors.sage, false: colors.stoneLight }}
                  thumbColor={colors.white}
                  aria-label={`Reminders for ${pet.name}`}
                />
              </View>
            );
          })
        )}

        {/* ACCOUNTS. Renders nothing in local mode — there's no server account to secure. */}
        <AccountSection />

        {/* SYNC-4. Renders nothing in local mode — no household exists to share. */}
        <HouseholdSection />

        <SectionTitle>Data</SectionTitle>
        <Pressable
          style={({ pressed }) => [styles.dataRow, pressed && styles.linkRowPressed]}
          onPress={() => setConfirmDemo(true)}
          role="button"
          aria-label="Load demo data"
        >
          <Text style={styles.dataIcon}>🧪</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.dataLabel}>Load demo data</Text>
            <Text style={styles.dataSub}>Replace everything with sample pets, logs and appointments.</Text>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.dataRow, pressed && styles.linkRowPressed]}
          onPress={() => setConfirmReset(true)}
          role="button"
          aria-label="Reset all data"
        >
          <Text style={styles.dataIcon}>🗑️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dataLabel, styles.danger]}>Reset all data</Text>
            <Text style={styles.dataSub}>Clear every pet, log and appointment on this device.</Text>
          </View>
        </Pressable>
      </ScrollView>

      <AppModal visible={confirmDemo} transparent animationType="fade" onRequestClose={() => setConfirmDemo(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmDemo(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Load demo data?</Text>
            <Text style={styles.dialogBody}>
              This replaces your current pets, logs and appointments with a sample set. This can't be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setConfirmDemo(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.confirmBtn, pressed && styles.pressed]}
                onPress={() => {
                  setConfirmDemo(false);
                  void loadDemoData();
                }}
                role="button"
                aria-label="Load demo data"
              >
                <Text style={styles.confirmBtnText}>Load</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>

      <AppModal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <Pressable style={styles.overlay} onPress={() => setConfirmReset(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Reset all data?</Text>
            <Text style={styles.dialogBody}>
              This clears every pet, log and appointment on this device. This can't be undone.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setConfirmReset(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.deleteBtn, pressed && styles.pressed]}
                onPress={() => {
                  setConfirmReset(false);
                  void resetAll();
                  // Drop any pushes we scheduled; the observer also re-reconciles to empty.
                  void cancelAllOurNotifications();
                }}
                role="button"
                aria-label="Reset all data"
              >
                <Text style={styles.deleteBtnText}>Reset</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
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
      <SectionTitle>Account</SectionTitle>

      {isAnonymous ? (
        pending ? (
          <View style={accountStyles.card}>
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
          </View>
        ) : (
          <View style={accountStyles.card}>
            <Text style={accountStyles.cardBody}>
              You’re signed in anonymously — add an email so you never lose your pets’ history.
            </Text>
            <TextInput
              style={accountStyles.input}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={colors.stoneLight}
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
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={accountStyles.primaryBtnText}>Secure account</Text>
              )}
            </Pressable>
          </View>
        )
      ) : (
        <View style={accountStyles.card}>
          <Text style={accountStyles.cardTitle}>Account secured</Text>
          <Text style={accountStyles.cardBody}>
            Secured as {email ?? 'your email'}. Your history is recoverable — sign in with this
            email on a new phone to pick up where you left off.
          </Text>
        </View>
      )}

      {recoverSent ? (
        <Text style={accountStyles.message}>
          Check your email — we sent a sign-in link to {recoverSent}.
        </Text>
      ) : (
        <Pressable
          style={({ pressed }) => [accountStyles.row, pressed && accountStyles.rowPressed]}
          onPress={() => {
            setRecoverError(null);
            setRecoverOpen(true);
          }}
          role="button"
          aria-label="Sign in with email"
        >
          <Text style={accountStyles.rowIcon}>✉️</Text>
          <View style={{ flex: 1 }}>
            <Text style={accountStyles.rowLabel}>Sign in with email</Text>
            <Text style={accountStyles.rowSub}>Recover an existing account onto this device.</Text>
          </View>
        </Pressable>
      )}

      <AppModal
        visible={recoverOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoverOpen(false)}
      >
        <Pressable style={accountStyles.overlay} onPress={() => setRecoverOpen(false)}>
          <Pressable style={accountStyles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={accountStyles.dialogTitle}>Sign in with email</Text>
            <Text style={accountStyles.dialogBody}>
              This switches this device to the account for that email. The pets, logs and
              history currently on this device will no longer show here (they stay in their own
              account). We’ll email you a sign-in link.
            </Text>
            <TextInput
              style={accountStyles.dialogInput}
              value={recoverEmail}
              onChangeText={setRecoverEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.stoneLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              accessibilityLabel="Email address"
            />
            {recoverError ? <Text style={accountStyles.errorText}>{recoverError}</Text> : null}
            <View style={accountStyles.dialogActions}>
              <Pressable
                style={({ pressed }) => [
                  accountStyles.dialogBtn,
                  accountStyles.cancelBtn,
                  pressed && accountStyles.pressed,
                ]}
                onPress={() => setRecoverOpen(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={accountStyles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  accountStyles.dialogBtn,
                  accountStyles.confirmBtn,
                  (!recoverEmail.trim() || recovering) && accountStyles.disabled,
                  pressed && accountStyles.pressed,
                ]}
                onPress={() => void submitRecover()}
                disabled={!recoverEmail.trim() || recovering}
                role="button"
                aria-label="Send sign-in link"
              >
                {recovering ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={accountStyles.confirmBtnText}>Send link</Text>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 16,
    marginBottom: 8,
    ...shadow.sm,
  },
  cardTitle: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 6 },
  cardBody: { fontSize: 13, color: colors.stoneMid, lineHeight: 19, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.stone,
    marginBottom: 10,
  },
  errorText: { fontSize: 12, color: '#C0392B', lineHeight: 17, marginBottom: 10 },
  primaryBtn: {
    backgroundColor: colors.sage,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.white },
  linkText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },

  message: { fontSize: 12, color: colors.sage, lineHeight: 17, marginBottom: 8, paddingHorizontal: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  rowPressed: { opacity: 0.7 },
  rowIcon: { fontSize: 18 },
  rowLabel: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  rowSub: { fontSize: 12, color: colors.stoneMid, marginTop: 2, lineHeight: 16 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow.card,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: colors.stoneMid, lineHeight: 19, marginBottom: 14 },
  dialogInput: {
    borderWidth: 1,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.stone,
    marginBottom: 12,
  },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.sagePale },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },
  confirmBtn: { backgroundColor: colors.sage },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 8,
  },
  title: { fontSize: 20, fontFamily: fonts.black, color: colors.stone, textAlign: 'center', flex: 1 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 22, fontFamily: fonts.extraBold, color: colors.stoneMid, marginTop: -2 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  helperText: { fontSize: 12, color: colors.stoneMid, lineHeight: 17, marginBottom: 14 },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 8 },

  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  muteAvatar: { backgroundColor: 'transparent' },
  muteName: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  muteSub: { fontSize: 12, color: colors.stoneMid, marginTop: 2 },

  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 14,
    marginBottom: 8,
    ...shadow.sm,
  },
  linkRowPressed: { opacity: 0.7 },
  dataIcon: { fontSize: 18 },
  dataLabel: { fontSize: 14, fontFamily: fonts.extraBold, color: colors.stone },
  dataSub: { fontSize: 12, color: colors.stoneMid, marginTop: 2, lineHeight: 16 },
  danger: { color: '#C0392B' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow.card,
  },
  dialogTitle: { fontSize: 16, fontFamily: fonts.extraBold, color: colors.stone, marginBottom: 8 },
  dialogBody: { fontSize: 13, color: colors.stoneMid, lineHeight: 19, marginBottom: 18 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.sagePale },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },
  confirmBtn: { backgroundColor: colors.sage },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
  deleteBtn: { backgroundColor: '#C0392B' },
  deleteBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.white },
});
