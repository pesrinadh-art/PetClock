import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { green, ink, line, radius, shadow, surface, terracotta } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';
import { useSession } from '../../context/SessionContext';
import { accountErrorMessage } from '../../lib/auth/account';

/**
 * MANDATORY email + 6-digit-code (OTP) onboarding — the first-launch flow (Phase-2).
 *
 * Two steps, one screen:
 *  1. Email — PawClock lockup + a single email field → `sendEmailCode` (Supabase
 *     `signInWithOtp({ shouldCreateUser: true })`) mails a 6-digit code.
 *  2. Code — a fresh segmented 6-cell input → `verifyEmailCode` (Supabase
 *     `verifyOtp({ type: 'email' })`). On success SessionContext resolves the household and
 *     flips `needsAuth` false; OnboardingGate then routes onward. Resend has a cooldown;
 *     "Use a different email" walks back to step 1.
 *
 * Passwordless and mandatory by product decision: no password, no OAuth, no skip. The design
 * mockup's password/Apple/Google/Skip affordances are intentionally omitted. Styling follows
 * `docs/DESIGN_SYSTEM.md` tokens + the drawn `Icon` set.
 *
 * Delivery failures never crash: `EMAIL_SEND_FAILED` shows a readable retry message (BE SMTP
 * may not be configured yet — see the task report / DEV bypass).
 */

const RESEND_COOLDOWN_SECONDS = 30;
const CODE_LENGTH = 6;

type Step = 'email' | 'code';

export function AuthFlow() {
  const { sendEmailCode, verifyEmailCode } = useSession();

  const [step, setStep] = useState<Step>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeInputRef = useRef<TextInput>(null);

  // Resend cooldown tick.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const startCooldown = useCallback(() => setCooldown(RESEND_COOLDOWN_SECONDS), []);

  const onSendCode = useCallback(async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await sendEmailCode(email);
      setStep('code');
      setCode('');
      startCooldown();
      // Give the OS a beat to mount the field before focusing.
      setTimeout(() => codeInputRef.current?.focus(), 150);
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [busy, email, sendEmailCode, startCooldown]);

  const onResend = useCallback(async () => {
    if (busy || cooldown > 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await sendEmailCode(email);
      setCode('');
      startCooldown();
      setNotice('New code sent.');
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [busy, cooldown, email, sendEmailCode, startCooldown]);

  const onVerify = useCallback(
    async (value: string) => {
      if (busy) return;
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        // Carry the name captured on the first screen through to verification. It is
        // best-effort stored on the auth user and used to name a newly created household.
        await verifyEmailCode(email, value, name.trim());
        // Success: SessionContext flips `needsAuth` false and OnboardingGate routes onward.
        // Keep the spinner up until this screen unmounts.
      } catch (e) {
        setError(accountErrorMessage(e));
        setCode('');
        setBusy(false);
        setTimeout(() => codeInputRef.current?.focus(), 50);
      }
    },
    [busy, email, name, verifyEmailCode],
  );

  const onCodeChange = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
      setCode(digits);
      if (error) setError(null);
      // Auto-submit the moment all six digits are present.
      if (digits.length === CODE_LENGTH) void onVerify(digits);
    },
    [error, onVerify],
  );

  const editEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setError(null);
    setNotice(null);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand lockup (shared by both steps) */}
          <View style={styles.brand}>
            <View style={styles.logoTile}>
              <Icon name="paw" size={40} color={green.primary} strokeWidth={2} />
            </View>
            <Text style={styles.wordmark}>PawClock</Text>
            <Text style={styles.tagline}>Never miss a break, meal or med.</Text>
          </View>

          {step === 'email' ? (
            <View style={styles.card}>
              <Text style={styles.heading}>Verify your email</Text>
              <Text style={styles.body}>
                We&apos;ll send a 6-digit code to confirm it&apos;s you. No password needed.
              </Text>

              <Text style={styles.label}>Your name</Text>
              <View style={[styles.field, name.length > 0 && styles.fieldActive]}>
                <Icon name="user" size={18} color={ink.faint} strokeWidth={2} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Alex"
                  placeholderTextColor={ink.faint2}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  style={styles.fieldInput}
                  editable={!busy}
                />
              </View>

              <Text style={styles.label}>Email</Text>
              <View
                style={[styles.field, email.length > 0 && styles.fieldActive, error && styles.fieldError]}
              >
                <Icon name="mail" size={18} color={ink.faint} strokeWidth={2} />
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={ink.faint2}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  onSubmitEditing={() => void onSendCode()}
                  style={styles.fieldInput}
                  editable={!busy}
                />
              </View>

              {error ? <ErrorRow message={error} /> : null}

              <Pressable
                onPress={() => void onSendCode()}
                disabled={busy}
                role="button"
                aria-label="Continue"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                  busy && styles.primaryBtnDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={ink.onDark} />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.heading}>Enter the code</Text>
              <Text style={styles.body}>
                We sent a 6-digit code to <Text style={styles.bodyStrong}>{email}</Text>.
              </Text>

              {/* Fresh segmented code input: 6 cells over one hidden TextInput. */}
              <Pressable
                style={styles.codeRow}
                onPress={() => codeInputRef.current?.focus()}
                accessibilityLabel="6-digit code"
              >
                {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                  const char = code[i] ?? '';
                  const active = i === code.length || (code.length === CODE_LENGTH && i === CODE_LENGTH - 1);
                  return (
                    <View
                      key={i}
                      style={[
                        styles.cell,
                        char !== '' && styles.cellFilled,
                        active && styles.cellActive,
                        error && styles.cellError,
                      ]}
                    >
                      <Text style={styles.cellText}>{char}</Text>
                    </View>
                  );
                })}
                <TextInput
                  ref={codeInputRef}
                  value={code}
                  onChangeText={onCodeChange}
                  keyboardType="number-pad"
                  maxLength={CODE_LENGTH}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  caretHidden
                  editable={!busy}
                  style={styles.hiddenInput}
                  accessibilityLabel="Verification code"
                />
              </Pressable>

              {error ? <ErrorRow message={error} /> : null}
              {!error && notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <Pressable
                onPress={() => void onVerify(code)}
                disabled={busy || code.length !== CODE_LENGTH}
                role="button"
                aria-label="Verify"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                  (busy || code.length !== CODE_LENGTH) && styles.primaryBtnDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={ink.onDark} />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify</Text>
                )}
              </Pressable>

              <View style={styles.resendRow}>
                {cooldown > 0 ? (
                  <Text style={styles.resendMuted}>Resend code in {cooldown}s</Text>
                ) : (
                  <Pressable onPress={() => void onResend()} disabled={busy} role="button" aria-label="Resend code">
                    <Text style={styles.resendLink}>Didn&apos;t get it? Resend code</Text>
                  </Pressable>
                )}
              </View>

              <Pressable onPress={editEmail} disabled={busy} role="button" aria-label="Use a different email" style={styles.backBtn}>
                <Icon name="chevronLeft" size={16} color={ink.muted} strokeWidth={2} />
                <Text style={styles.backText}>Use a different email</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <View style={styles.errorRow}>
      <Icon name="alert" size={16} color={terracotta.primary} strokeWidth={2} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },

  brand: { alignItems: 'center', marginBottom: 28 },
  logoTile: {
    width: 76,
    height: 76,
    borderRadius: radius.hero,
    backgroundColor: green.tint,
    borderWidth: 1,
    borderColor: green.tintBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  wordmark: { fontSize: 30, fontFamily: fonts.black, color: ink.primary, letterSpacing: -0.5 },
  tagline: { fontSize: 14.5, fontFamily: fonts.medium, color: ink.muted, marginTop: 4 },

  card: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: 22,
    ...shadow.card,
  },
  heading: { fontSize: 21, fontFamily: fonts.black, color: ink.primary, letterSpacing: -0.4 },
  body: { fontSize: 14.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 21, marginTop: 6 },
  bodyStrong: { fontFamily: fonts.bold, color: ink.primary },

  label: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: ink.faint,
    marginTop: 20,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: surface.field,
    borderWidth: 1.5,
    borderColor: line.border,
    borderRadius: radius.tile,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldActive: { borderColor: green.tintBorder, backgroundColor: surface.card },
  fieldError: { borderColor: terracotta.primary },
  fieldInput: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15.5, color: ink.primary, padding: 0 },

  // Segmented code input
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 22 },
  cell: {
    flex: 1,
    aspectRatio: 0.82,
    maxWidth: 52,
    borderRadius: radius.tile,
    backgroundColor: surface.field,
    borderWidth: 1.5,
    borderColor: line.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { backgroundColor: surface.card, borderColor: green.tintBorder },
  cellActive: { borderColor: green.mid, backgroundColor: surface.card },
  cellError: { borderColor: terracotta.primary },
  cellText: { fontSize: 24, fontFamily: fonts.black, color: ink.primary },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  errorText: { flex: 1, fontSize: 13, fontFamily: fonts.semiBold, color: terracotta.primary, lineHeight: 18 },
  notice: { fontSize: 13, fontFamily: fonts.semiBold, color: green.primary, marginTop: 12 },

  primaryBtn: {
    backgroundColor: green.mid,
    borderRadius: radius.tile,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 54,
    ...shadow.fab,
  },
  primaryBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: ink.onDark, fontSize: 15.5, fontFamily: fonts.extraBold, letterSpacing: 0.2 },

  resendRow: { alignItems: 'center', marginTop: 18 },
  resendMuted: { fontSize: 13.5, fontFamily: fonts.medium, color: ink.faint },
  resendLink: { fontSize: 13.5, fontFamily: fonts.bold, color: green.primary },

  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 16 },
  backText: { fontSize: 13.5, fontFamily: fonts.semiBold, color: ink.muted },
});

export default AuthFlow;
