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
import { accent, danger, glass, ink, radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';
import { BrandMark } from '../BrandMark';
import { Screen } from '../ui';
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
 * Aurora Minimal (design v2): aurora field, glass inputs, one violet accent, mono code digits.
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
  const [focus, setFocus] = useState<'name' | 'email' | 'code' | null>(null);

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
    <Screen edges={['top', 'bottom', 'left', 'right']}>
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
            <View style={styles.mark}>
              <BrandMark size={52} />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.wordmark}>PawClock</Text>
              <Text style={styles.tagline}>Never miss a break, meal or med.</Text>
            </View>
          </View>

          {step === 'email' ? (
            <View>
              <Text style={styles.heading} role="heading">
                Verify your email
              </Text>
              <Text style={styles.body}>
                We&apos;ll send a 6-digit code to confirm it&apos;s you. No password needed.
              </Text>

              <Text style={styles.label}>Your name</Text>
              <View style={[styles.field, focus === 'name' && styles.fieldFocused]}>
                <Icon name="user" size={18} color={ink.placeholder} strokeWidth={1.8} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Alex"
                  placeholderTextColor={ink.placeholder}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onFocus={() => setFocus('name')}
                  onBlur={() => setFocus(null)}
                  style={styles.fieldInput}
                  editable={!busy}
                />
              </View>

              <Text style={styles.label}>Email</Text>
              <View
                style={[
                  styles.field,
                  focus === 'email' && styles.fieldFocused,
                  error ? styles.fieldError : null,
                ]}
              >
                <Icon name="mail" size={18} color={ink.placeholder} strokeWidth={1.8} />
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={ink.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  onSubmitEditing={() => void onSendCode()}
                  onFocus={() => setFocus('email')}
                  onBlur={() => setFocus(null)}
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
                  <ActivityIndicator color={accent.onAccent} />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={styles.heading} role="heading">
                Enter the code
              </Text>
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
                  const active =
                    focus === 'code' &&
                    (i === code.length || (code.length === CODE_LENGTH && i === CODE_LENGTH - 1));
                  return (
                    <View
                      key={i}
                      style={[
                        styles.cell,
                        char !== '' && styles.cellFilled,
                        active && styles.cellActive,
                        error ? styles.cellError : null,
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
                  onFocus={() => setFocus('code')}
                  onBlur={() => setFocus(null)}
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
                  <ActivityIndicator color={accent.onAccent} />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify</Text>
                )}
              </Pressable>

              <View style={styles.resendRow}>
                {cooldown > 0 ? (
                  <Text style={styles.resendMuted}>
                    Resend code in <Text style={styles.mono}>{cooldown}s</Text>
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => void onResend()}
                    disabled={busy}
                    role="button"
                    aria-label="Resend code"
                    style={styles.linkBtn}
                  >
                    <Text style={styles.resendLink}>Didn&apos;t get it? Resend code</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={editEmail}
                disabled={busy}
                role="button"
                aria-label="Use a different email"
                style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              >
                <Icon name="chevronLeft" size={16} color={ink.muted} strokeWidth={1.8} />
                <Text style={styles.backText}>Use a different email</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <View style={styles.errorRow}>
      <Icon name="alert" size={15} color={danger.primary} strokeWidth={1.9} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 40 },

  // Brand mark: the Liquid Glass Paw logo with a soft lift off the aurora.
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 34 },
  mark: {
    shadowColor: '#1E1E46',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  brandText: { flex: 1 },
  wordmark: { fontSize: 19, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.6 },
  tagline: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, marginTop: 2 },

  heading: {
    fontSize: 24,
    fontFamily: fonts.medium,
    color: ink.primary,
    letterSpacing: -0.85,
    lineHeight: 27,
  },
  body: { fontSize: 13.5, fontFamily: fonts.regular, color: ink.muted, lineHeight: 21, marginTop: 6 },
  bodyStrong: { fontFamily: fonts.medium, color: ink.primary },

  label: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: ink.muted,
    marginTop: 18,
    marginBottom: 6,
    marginHorizontal: 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldFocused: { borderColor: accent.line },
  fieldError: { borderColor: danger.primary },
  fieldInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: ink.primary, padding: 0 },

  // Segmented code input — mono digits in glass cells.
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 22 },
  cell: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: accent.line },
  cellActive: { borderColor: accent.primary, borderWidth: 1.5 },
  cellError: { borderColor: danger.primary },
  cellText: { fontSize: 22, fontFamily: fonts.mono, color: ink.primary },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, marginHorizontal: 2 },
  errorText: { flex: 1, fontSize: 12.5, fontFamily: fonts.regular, color: danger.primary, lineHeight: 18 },
  notice: { fontSize: 12.5, fontFamily: fonts.medium, color: accent.ink, marginTop: 10, textAlign: 'center' },

  primaryBtn: {
    backgroundColor: accent.primary,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 50,
    paddingHorizontal: 16,
    shadowColor: accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  primaryBtnPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: accent.onAccent, fontSize: 15, fontFamily: fonts.medium },

  resendRow: { alignItems: 'center', marginTop: 14 },
  linkBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  resendMuted: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted, paddingVertical: 9 },
  mono: { fontFamily: fonts.monoRegular },
  resendLink: { fontSize: 13, fontFamily: fonts.medium, color: accent.ink },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 36,
    marginTop: 4,
  },
  backText: { fontSize: 13, fontFamily: fonts.regular, color: ink.muted },
});

export default AuthFlow;
