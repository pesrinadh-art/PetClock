import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { amber, green, ink, line, radius, shadow, space, surface, tap } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Button, TextField } from '../ui';
import { BrandMark, InlineNotice } from '../onboarding/OnboardingKit';
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
 * mockup's password/Apple/Google/Skip affordances are intentionally omitted.
 *
 * Pet-owner redesign: calm, reassuring copy; 56px CTAs; big code cells; gentle amber
 * (never red) notices that pair an icon with the text.
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

  const codeComplete = code.length === CODE_LENGTH;

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
            <BrandMark size={72} />
            <Text style={styles.wordmark}>PawClock</Text>
            <Text style={styles.tagline}>Never miss a potty break again</Text>
          </View>

          {step === 'email' ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.heading} role="heading">
                  Welcome! Let&apos;s get you in
                </Text>
                <Text style={styles.body}>
                  We&apos;ll email you a 6-digit code. No password to remember.
                </Text>
              </View>

              <TextField
                label="Your name"
                hint="Optional. We'll use it to name your household."
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alex"
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                editable={!busy}
              />

              <TextField
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={() => void onSendCode()}
                editable={!busy}
              />

              {error ? <InlineNotice tone="attention" message={error} /> : null}

              <Button
                label="Email me a code"
                accessibilityLabel="Continue"
                icon="mail"
                fullWidth
                loading={busy}
                onPress={() => void onSendCode()}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.heading} role="heading">
                  Check your inbox
                </Text>
                <Text style={styles.body}>
                  We sent a 6-digit code to <Text style={styles.bodyStrong}>{email}</Text>. Type it below.
                </Text>
              </View>

              {/* Segmented code input: 6 big cells over one hidden TextInput. */}
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
                      {active && char === '' && !error ? <View style={styles.caret} /> : null}
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

              {error ? (
                <InlineNotice tone="attention" message={error} />
              ) : notice ? (
                <InlineNotice tone="pet" message={notice} />
              ) : (
                <Text style={styles.hint}>It usually arrives within a minute. Not there? Check your spam folder.</Text>
              )}

              <Button
                label="Verify and continue"
                accessibilityLabel="Verify"
                icon="check"
                fullWidth
                loading={busy}
                disabled={!codeComplete}
                onPress={() => void onVerify(code)}
              />

              <View style={styles.secondaryActions}>
                {cooldown > 0 ? (
                  <View style={styles.cooldownRow}>
                    <Icon name="clock" size={16} color={ink.muted} strokeWidth={2} />
                    <Text style={styles.cooldownText}>You can resend a code in {cooldown}s</Text>
                  </View>
                ) : (
                  <Button
                    label="Send me a new code"
                    accessibilityLabel="Resend code"
                    variant="ghost"
                    size="md"
                    icon="mail"
                    disabled={busy}
                    onPress={() => void onResend()}
                    style={styles.centerBtn}
                  />
                )}
                <Button
                  label="Use a different email"
                  variant="ghost"
                  tone="neutral"
                  size="md"
                  icon="chevronLeft"
                  disabled={busy}
                  onPress={editEmail}
                  style={styles.centerBtn}
                />
              </View>
            </View>
          )}

          <View style={styles.reassure}>
            <Icon name="lock" size={16} color={ink.muted} strokeWidth={2} />
            <Text style={styles.reassureText}>
              Signing in keeps your pet&apos;s day safe and shared with your household.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.gutter, paddingVertical: space.xxl },

  brand: { alignItems: 'center', marginBottom: space.section, gap: 6 },
  wordmark: { ...type.title, color: green.primary, marginTop: space.xs },
  tagline: { ...type.body, color: ink.muted, textAlign: 'center' },

  card: {
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.lg,
    ...shadow.card,
  },
  cardHead: { gap: 6 },
  heading: { ...type.title, color: ink.primary },
  body: { ...type.body, color: ink.muted },
  bodyStrong: { fontFamily: fonts.bold, color: ink.primary },
  hint: { ...type.bodySm, color: ink.muted, textAlign: 'center' },

  // Segmented code input
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: space.xs },
  cell: {
    flex: 1,
    maxWidth: 52,
    height: 62,
    borderRadius: radius.tile,
    backgroundColor: surface.field,
    borderWidth: 2,
    borderColor: line.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { backgroundColor: surface.card, borderColor: green.tintBorder },
  cellActive: { borderColor: green.mid, backgroundColor: surface.card },
  cellError: { borderColor: amber.primary, backgroundColor: amber.warnBg },
  cellText: { fontSize: 26, fontFamily: fonts.extraBold, color: ink.primary },
  caret: { position: 'absolute', bottom: 14, width: 16, height: 3, borderRadius: 2, backgroundColor: green.mid },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },

  secondaryActions: { alignItems: 'center', gap: 2 },
  // Button hugs with alignSelf 'flex-start' when not fullWidth; re-centre it here.
  centerBtn: { alignSelf: 'center' },
  cooldownRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: tap.min },
  cooldownText: { ...type.bodySm, color: ink.muted },

  reassure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.xl,
    paddingHorizontal: space.xs,
  },
  reassureText: { ...type.caption, color: ink.muted, textAlign: 'center', flexShrink: 1 },
});

export default AuthFlow;
