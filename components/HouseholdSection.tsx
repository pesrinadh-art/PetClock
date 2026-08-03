import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppModal } from './AppModal';
import { SectionTitle } from './SectionTitle';
import { useSession } from '../context/SessionContext';
import { getSupabaseClient } from '../lib/db/client';
import { createInvite, householdErrorMessage, type Invite } from '../lib/household/invites';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';

/**
 * SYNC-4: the two-phone flow.
 *
 * The shared prediction is the whole product — two caregivers, one dog, one answer to "did
 * she go?". Until this existed every device created its OWN household on first launch, so
 * there was no way to put two phones in the same one.
 *
 * Renders nothing in local mode: there is no household to share when everything lives on
 * this device.
 */
export function HouseholdSection() {
  const { synced, householdId, join } = useSession();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [minting, setMinting] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!synced || !householdId) return null;

  const mint = async () => {
    setMinting(true);
    setMessage(null);
    try {
      setInvite(await createInvite(getSupabaseClient()));
    } catch (e) {
      setMessage(householdErrorMessage(e));
    } finally {
      setMinting(false);
    }
  };

  const submitJoin = async () => {
    setJoining(true);
    try {
      const result = await join(code);
      setJoinOpen(false);
      setCode('');
      // `leftPrevious: false` means the old household still held pets, so the user is now
      // in two. Say so — silently keeping a second household is the kind of thing people
      // discover months later and can't explain.
      setMessage(
        result.leftPrevious
          ? 'Joined. You and your partner now share one household.'
          : 'Joined. Your previous household still has pets, so it was kept.',
      );
    } catch (e) {
      setMessage(householdErrorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      <SectionTitle>Household</SectionTitle>
      <Text style={styles.helperText}>
        Share this household so both of you get the same reminders. Whoever answers first
        logs it — the other phone just updates.
      </Text>

      {invite ? (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Invite code</Text>
          <Text style={styles.code} selectable accessibilityLabel={`Invite code ${invite.code}`}>
            {invite.code}
          </Text>
          <Text style={styles.codeSub}>
            {invite.maxUses - invite.useCount} use
            {invite.maxUses - invite.useCount === 1 ? '' : 's'} left · expires{' '}
            {new Date(invite.expiresAt).toLocaleDateString()}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
            onPress={() =>
              void Share.share({
                message: `Join our PawClock household with code ${invite.code}`,
              })
            }
            role="button"
            aria-label="Share invite code"
          >
            <Text style={styles.shareBtnText}>Share code</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void mint()}
          disabled={minting}
          role="button"
          aria-label="Invite a caregiver"
        >
          <Text style={styles.rowIcon}>💌</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Invite a caregiver</Text>
            <Text style={styles.rowSub}>Create a code for your partner or sitter.</Text>
          </View>
          {minting ? <ActivityIndicator color={colors.sage} /> : null}
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => {
          setMessage(null);
          setJoinOpen(true);
        }}
        role="button"
        aria-label="Join a household"
      >
        <Text style={styles.rowIcon}>🔑</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Join a household</Text>
          <Text style={styles.rowSub}>Enter a code you were sent.</Text>
        </View>
      </Pressable>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <AppModal
        visible={joinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setJoinOpen(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>Join a household</Text>
            <Text style={styles.dialogBody}>
              This device will switch to their pets and reminders. Anything you added here
              first stays behind on your own household.
            </Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={colors.stoneLight}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              accessibilityLabel="Invite code"
            />
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => setJoinOpen(false)}
                role="button"
                aria-label="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogBtn,
                  styles.confirmBtn,
                  (!code.trim() || joining) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => void submitJoin()}
                disabled={!code.trim() || joining}
                role="button"
                aria-label="Join"
              >
                {joining ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.confirmBtnText}>Join</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  helperText: { fontSize: 12, color: colors.stoneMid, lineHeight: 17, marginBottom: 14 },

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

  codeCard: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
    ...shadow.sm,
  },
  codeLabel: { fontSize: 11, color: colors.stoneMid, letterSpacing: 0.8, textTransform: 'uppercase' },
  code: {
    fontSize: 30,
    fontFamily: fonts.mono,
    color: colors.sage,
    letterSpacing: 4,
    marginVertical: 8,
  },
  codeSub: { fontSize: 12, color: colors.stoneMid, marginBottom: 12 },
  shareBtn: {
    backgroundColor: colors.sagePale,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  shareBtnText: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.sage },

  message: { fontSize: 12, color: colors.sage, lineHeight: 17, marginBottom: 8, paddingHorizontal: 2 },

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
  input: {
    borderWidth: 1,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 20,
    fontFamily: fonts.mono,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.stone,
    marginBottom: 18,
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
