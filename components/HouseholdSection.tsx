import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppModal } from './AppModal';
import { Card, GlassSurface, Pill, SectionLabel } from './ui';
import { Icon } from './Icon';
import { useSession } from '../context/SessionContext';
import { getSupabaseClient } from '../lib/db/client';
import {
  createInvite,
  householdErrorMessage,
  leaveHousehold,
  listMembers,
  removeMember,
  revokeInvite,
  type Invite,
  type InviteRole,
  type Member,
} from '../lib/household/invites';
import { accent, danger, glass, ink, radius, surface, warn } from '../theme/colors';
import { fonts } from '../theme/fonts';

/** The `member_role` enum in caregiver terms — the DB never stores presentation strings. */
const ROLE_LABEL: Record<InviteRole, string> = {
  owner: 'Owner',
  member: 'Caregiver',
  walker: 'Walker',
};

/** Role → pill palette. Owner reads as the accent; a time-boxed walker as warn attention. */
const ROLE_PILL: Record<InviteRole, { bg: string; color: string; border: string }> = {
  owner: { bg: accent.soft, color: accent.ink, border: accent.line },
  member: { bg: 'transparent', color: ink.muted, border: glass.border2 },
  walker: { bg: warn.soft, color: warn.ink, border: warn.line },
};

/** A settled message shown under the section: success reads calm, error reads alarming. */
type Notice = { text: string; error?: boolean };

/** Destructive accent for remove/leave/revoke. */
const DANGER = danger.primary;

/**
 * Copy to the OS clipboard where we can without a native dependency. react-native-web maps
 * onto `navigator.clipboard`, which is the dependable path on desktop web where the Share
 * sheet (`navigator.share`) is frequently unavailable. Returns false on native or when the
 * API is missing, so the caller can fall back to Share.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const clip = (navigator as { clipboard?: { writeText?: (t: string) => Promise<void> } }).clipboard;
  if (!clip?.writeText) return false;
  try {
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Web Share sheet when the browser offers one; false so the caller can fall back to copy. */
async function webShare(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const nav = navigator as { share?: (d: { text: string }) => Promise<void> };
  if (!nav.share) return false;
  try {
    await nav.share({ text });
    return true;
  } catch {
    return false;
  }
}

export function HouseholdSection({
  onMembersLoaded,
}: {
  /** Lets a host screen (the Shared tab hero) reflect the live member count. */
  onMembersLoaded?: (members: Member[]) => void;
}) {
  // Current user id comes from the session, NOT a prop. Whether *this* user is an owner is
  // derived from their own row in the fetched member list, never assumed.
  const { synced, householdId, join, session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [invite, setInvite] = useState<Invite | null>(null);
  const [minting, setMinting] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Keep the latest callback in a ref so it never widens loadMembers' dependency set (which
  // would refetch the member list on every host re-render).
  const onLoadedRef = useRef(onMembersLoaded);
  onLoadedRef.current = onMembersLoaded;

  const loadMembers = useCallback(async () => {
    if (!synced || !householdId) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const list = await listMembers(getSupabaseClient(), householdId);
      setMembers(list);
      onLoadedRef.current?.(list);
    } catch (e) {
      setMembersError(householdErrorMessage(e));
    } finally {
      setMembersLoading(false);
    }
  }, [synced, householdId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  // Renders nothing in local mode: there is no household to share when everything lives on
  // this device. The host screen owns the "sharing needs sync" messaging.
  if (!synced || !householdId) return null;

  const myRole = members.find((m) => m.userId === currentUserId)?.role ?? null;
  const isOwner = myRole === 'owner';

  const mint = async () => {
    setMinting(true);
    setMessage(null);
    try {
      setInvite(await createInvite(getSupabaseClient()));
    } catch (e) {
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setMinting(false);
    }
  };

  const revoke = async () => {
    if (!invite) return;
    setRevoking(true);
    setMessage(null);
    try {
      await revokeInvite(getSupabaseClient(), householdId, invite.code);
      setInvite(null);
      setMessage({ text: 'Invite revoked. That code no longer works.' });
    } catch (e) {
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setRevoking(false);
    }
  };

  const shareInvite = async () => {
    if (!invite) return;
    const text = `Join our PawClock household with code ${invite.code}`;
    // Native gets the OS share sheet (fastest way into a text message); web tries the browser
    // Share sheet, falling back to clipboard where it isn't offered.
    if (Platform.OS !== 'web') {
      try {
        await Share.share({ message: text });
      } catch {
        /* user dismissed the sheet */
      }
      return;
    }
    if (await webShare(text)) return;
    if (await copyToClipboard(text)) {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    // Copy is the dependable path on web; native has no clipboard without a dependency, so
    // fall back to the OS share sheet there.
    if (await copyToClipboard(invite.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    try {
      await Share.share({ message: `Join our PawClock household with code ${invite.code}` });
    } catch {
      /* dismissed */
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeMember(getSupabaseClient(), householdId, removeTarget.userId);
      setRemoveTarget(null);
      setMessage({ text: 'Removed. They no longer have access to this household.' });
      await loadMembers();
    } catch (e) {
      setRemoveTarget(null);
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setRemoving(false);
    }
  };

  const confirmLeave = async () => {
    setLeaving(true);
    try {
      await leaveHousehold(getSupabaseClient(), householdId);
      setLeaveOpen(false);
      setMembers([]);
      onLoadedRef.current?.([]);
      setInvite(null);
      setMessage({ text: "You've left the household. This device will move to a fresh one." });
    } catch (e) {
      setLeaveOpen(false);
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setLeaving(false);
    }
  };

  const submitJoin = async () => {
    setJoining(true);
    try {
      const result = await join(code);
      setJoinOpen(false);
      setCode('');
      setInvite(null);
      setMessage({
        text: result.leftPrevious
          ? 'Joined. You and your partner now share one household.'
          : 'Joined. Your previous household still has pets, so it was kept.',
      });
      await loadMembers();
    } catch (e) {
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setJoining(false);
    }
  };

  const usesLeft = invite ? invite.maxUses - invite.useCount : 0;

  return (
    <>
      {/* ── Invite code ─────────────────────────────────────────────── */}
      <SectionLabel>Invite code</SectionLabel>
      {invite ? (
        <Card padded style={styles.inviteCard}>
          <Text style={styles.kicker}>Invite code</Text>
          <Text style={styles.code} selectable accessibilityLabel={`Invite code ${invite.code}`}>
            {invite.code}
          </Text>

          <View style={styles.invitePills}>
            <Pill
              label={`${usesLeft} use${usesLeft === 1 ? '' : 's'} left`}
              bg={accent.soft}
              color={accent.ink}
              size="sm"
              style={{ ...styles.pillBorder, borderColor: accent.line }}
            />
            <Pill
              label={`Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
              bg="transparent"
              color={ink.muted}
              size="sm"
              style={{ ...styles.pillBorder, borderColor: glass.border2 }}
            />
          </View>

          <View style={styles.inviteBtns}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
              onPress={() => void shareInvite()}
              role="button"
              aria-label="Share invite"
            >
              <Icon name="share" size={15} color={accent.onAccent} strokeWidth={1.8} />
              <Text style={styles.btnPrimaryText}>{shared ? 'Shared!' : 'Share invite'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnGlass, pressed && styles.pressed]}
              onPress={() => void copyInvite()}
              role="button"
              aria-label="Copy code"
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} color={ink.primary} strokeWidth={1.8} />
              <Text style={styles.btnGlassText}>{copied ? 'Copied!' : 'Copy code'}</Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.revokeBtn, pressed && styles.pressed]}
            onPress={() => void revoke()}
            disabled={revoking}
            hitSlop={8}
            role="button"
            aria-label="Revoke invite code"
          >
            {revoking ? (
              <ActivityIndicator color={DANGER} size="small" />
            ) : (
              <Text style={styles.revokeText}>Revoke</Text>
            )}
          </Pressable>
        </Card>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.mintCta, minting && styles.disabled, pressed && styles.pressed]}
          onPress={() => void mint()}
          disabled={minting}
          role="button"
          aria-label="Create an invite code"
        >
          {minting ? (
            <ActivityIndicator color={accent.onAccent} />
          ) : (
            <>
              <Icon name="userPlus" size={17} color={accent.onAccent} strokeWidth={1.8} />
              <Text style={styles.mintCtaText}>Invite a caregiver</Text>
            </>
          )}
        </Pressable>
      )}

      <Card style={styles.joinCard}>
        <Pressable
          style={({ pressed }) => [styles.joinRow, pressed && styles.rowPressed]}
          onPress={() => {
            setMessage(null);
            setJoinOpen(true);
          }}
          role="button"
          aria-label="Join a household with a code"
        >
          <View style={styles.joinIcon}>
            <Icon name="key" size={17} color={ink.muted} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.joinTitle}>Have a code?</Text>
            <Text style={styles.joinSub}>Join a household</Text>
          </View>
          <Icon name="chevronRight" size={15} color={ink.placeholder} strokeWidth={2} />
        </Pressable>
      </Card>

      {/* ── Members ─────────────────────────────────────────────────── */}
      <SectionLabel style={styles.sectionSpacer}>Members</SectionLabel>
      {membersLoading && members.length === 0 ? (
        <Card padded style={styles.stateCard}>
          <ActivityIndicator color={accent.primary} />
        </Card>
      ) : membersError ? (
        <Card padded>
          <Text style={styles.errorText}>{membersError}</Text>
        </Card>
      ) : members.length === 0 ? (
        <Card padded>
          <Text style={styles.emptyText}>No one else has joined yet. Share your code above.</Text>
        </Card>
      ) : (
        <Card>
          {members.map((m, i) => {
            const isYou = m.userId === currentUserId;
            const pill = ROLE_PILL[m.role];
            return (
              <View key={m.userId}>
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, isYou ? styles.avatarYou : styles.avatarMute]}>
                    <Icon name="user" size={15} color={isYou ? accent.ink : ink.muted} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {ROLE_LABEL[m.role]}
                      {isYou ? <Text style={styles.youTag}> · you</Text> : null}
                    </Text>
                    <View style={styles.memberMeta}>
                      <Pill
                        label={ROLE_LABEL[m.role]}
                        bg={pill.bg}
                        color={pill.color}
                        size="sm"
                        style={{ ...styles.pillBorder, borderColor: pill.border }}
                      />
                      <Text style={styles.memberSub} numberOfLines={1}>
                        Joined {new Date(m.joinedAt).toLocaleDateString()}
                        {m.memberExpiresAt
                          ? ` · access until ${new Date(m.memberExpiresAt).toLocaleDateString()}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                  {isYou ? (
                    <Pressable
                      style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}
                      onPress={() => {
                        setMessage(null);
                        setLeaveOpen(true);
                      }}
                      hitSlop={6}
                      role="button"
                      aria-label="Leave household"
                    >
                      <Text style={styles.rowBtnText}>Leave</Text>
                    </Pressable>
                  ) : isOwner ? (
                    <Pressable
                      style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}
                      onPress={() => {
                        setMessage(null);
                        setRemoveTarget(m);
                      }}
                      hitSlop={6}
                      role="button"
                      aria-label={`Remove ${ROLE_LABEL[m.role]}`}
                    >
                      <Text style={styles.rowBtnText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                {i < members.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })}
        </Card>
      )}

      {message ? (
        <Text style={[styles.message, message.error && styles.messageError]}>{message.text}</Text>
      ) : null}

      {/* ── Confirm: remove ─────────────────────────────────────────── */}
      <AppModal
        visible={removeTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRemoveTarget(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.dialogWrap}>
            <GlassSurface fallbackColor={surface.solid} style={styles.dialog}>
              <Text style={styles.dialogTitle}>
                Remove this {removeTarget ? ROLE_LABEL[removeTarget.role].toLowerCase() : 'member'}?
              </Text>
              <Text style={styles.dialogBody}>
                They&apos;ll immediately lose access to this household&apos;s pets, reminders and
                shared logs. You can always invite them again with a new code.
              </Text>
              <View style={styles.dialogActions}>
                <Pressable
                  style={({ pressed }) => [styles.dlgBtn, styles.dlgCancel, pressed && styles.pressed]}
                  onPress={() => setRemoveTarget(null)}
                  role="button"
                  aria-label="Cancel"
                >
                  <Text style={styles.dlgCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.dlgBtn,
                    styles.dlgDanger,
                    removing && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void confirmRemove()}
                  disabled={removing}
                  role="button"
                  aria-label="Remove"
                >
                  {removing ? (
                    <ActivityIndicator color={ink.onDark} />
                  ) : (
                    <Text style={styles.dlgSolidText}>Remove</Text>
                  )}
                </Pressable>
              </View>
            </GlassSurface>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* ── Confirm: leave ──────────────────────────────────────────── */}
      <AppModal
        visible={leaveOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setLeaveOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.dialogWrap}>
            <GlassSurface fallbackColor={surface.solid} style={styles.dialog}>
              <Text style={styles.dialogTitle}>Leave this household?</Text>
              <Text style={styles.dialogBody}>
                This device will lose access to the shared pets and reminders and move to a fresh
                household of its own. If you&apos;re the only owner, move or hand off the pets first.
              </Text>
              <View style={styles.dialogActions}>
                <Pressable
                  style={({ pressed }) => [styles.dlgBtn, styles.dlgCancel, pressed && styles.pressed]}
                  onPress={() => setLeaveOpen(false)}
                  role="button"
                  aria-label="Cancel"
                >
                  <Text style={styles.dlgCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.dlgBtn,
                    styles.dlgDanger,
                    leaving && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void confirmLeave()}
                  disabled={leaving}
                  role="button"
                  aria-label="Leave household"
                >
                  {leaving ? (
                    <ActivityIndicator color={ink.onDark} />
                  ) : (
                    <Text style={styles.dlgSolidText}>Leave</Text>
                  )}
                </Pressable>
              </View>
            </GlassSurface>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* ── Join with a code ────────────────────────────────────────── */}
      <AppModal
        visible={joinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setJoinOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.dialogWrap}>
            <GlassSurface fallbackColor={surface.solid} style={styles.dialog}>
              <Text style={styles.dialogTitle}>Join a household</Text>
              <Text style={styles.dialogBody}>
                This device will switch to their pets and reminders. Anything you added here first
                stays behind on your own household.
              </Text>
              <Text style={styles.fieldLabel}>Invite code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={ink.placeholder}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                accessibilityLabel="Invite code"
              />
              <View style={styles.dialogActions}>
                <Pressable
                  style={({ pressed }) => [styles.dlgBtn, styles.dlgCancel, pressed && styles.pressed]}
                  onPress={() => setJoinOpen(false)}
                  role="button"
                  aria-label="Cancel"
                >
                  <Text style={styles.dlgCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.dlgBtn,
                    styles.dlgConfirm,
                    (!code.trim() || joining) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void submitJoin()}
                  disabled={!code.trim() || joining}
                  role="button"
                  aria-label="Join"
                >
                  {joining ? (
                    <ActivityIndicator color={accent.onAccent} />
                  ) : (
                    <Text style={styles.dlgSolidText}>Join</Text>
                  )}
                </Pressable>
              </View>
            </GlassSurface>
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionSpacer: { marginTop: 24 },

  // Invite code card (design v2 `.card.glass.ev-code`)
  inviteCard: { alignItems: 'center', paddingTop: 18 },
  kicker: { fontFamily: fonts.mono, fontSize: 11.5, color: accent.ink },
  code: {
    fontFamily: fonts.mono,
    fontSize: 28,
    letterSpacing: 5,
    color: ink.primary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
    paddingLeft: 5, // balance the trailing letter-spacing so the code reads centred
  },
  invitePills: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  pillBorder: { borderWidth: 1 },
  inviteBtns: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  btnPrimary: { backgroundColor: accent.primary },
  btnPrimaryText: { fontFamily: fonts.medium, fontSize: 14, color: accent.onAccent },
  btnGlass: { backgroundColor: glass.strong, borderWidth: 1, borderColor: glass.border2 },
  btnGlassText: { fontFamily: fonts.medium, fontSize: 14, color: ink.primary },
  revokeBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeText: { fontFamily: fonts.medium, fontSize: 13, color: DANGER },

  // Create-invite CTA (design v2 `.btn.primary`)
  mintCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
    shadowColor: accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  mintCtaText: { fontFamily: fonts.medium, fontSize: 14.5, color: accent.onAccent },

  // "Have a code?" row (design v2 `.row.tap` with a muted tile)
  joinCard: { marginTop: 10 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14 },
  joinIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinTitle: { fontFamily: fonts.medium, fontSize: 14, color: ink.primary },
  joinSub: { fontFamily: fonts.regular, fontSize: 12, color: ink.muted, marginTop: 2 },
  rowPressed: { opacity: 0.6 },

  // Members
  stateCard: { alignItems: 'center' },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: DANGER, lineHeight: 19 },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: ink.muted, lineHeight: 19 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: { backgroundColor: accent.soft, borderColor: accent.line },
  avatarMute: { backgroundColor: glass.strong, borderColor: glass.border },
  memberName: { fontFamily: fonts.medium, fontSize: 14, color: ink.primary },
  youTag: { fontFamily: fonts.regular, color: ink.muted },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  memberSub: { flexShrink: 1, fontFamily: fonts.monoRegular, fontSize: 11, color: ink.muted },
  rowBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBtnText: { fontFamily: fonts.medium, fontSize: 13, color: DANGER },
  divider: { height: 1, backgroundColor: glass.border, marginLeft: 58, marginRight: 14 },

  message: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: accent.ink,
    lineHeight: 19,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  messageError: { color: DANGER },

  // Dialogs
  overlay: {
    flex: 1,
    backgroundColor: glass.scrimDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialogWrap: { width: '100%', maxWidth: 340 },
  // glass.strong overrides GlassSurface's thin iOS wash so dialog copy stays legible.
  dialog: { borderRadius: radius.sheet, padding: 22, backgroundColor: glass.strong },
  dialogTitle: { fontFamily: fonts.medium, fontSize: 18, color: ink.primary, letterSpacing: -0.45, marginBottom: 8 },
  dialogBody: { fontFamily: fonts.regular, fontSize: 13.5, color: ink.muted, lineHeight: 20, marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.regular, fontSize: 12, color: ink.muted, marginBottom: 6, marginLeft: 2 },
  input: {
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
    borderRadius: radius.tile,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.mono,
    fontSize: 18,
    letterSpacing: 3,
    textAlign: 'center',
    color: ink.primary,
    marginBottom: 18,
  },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dlgBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlgCancel: { backgroundColor: glass.strong, borderWidth: 1, borderColor: glass.border2 },
  dlgCancelText: { fontFamily: fonts.medium, fontSize: 14, color: ink.primary },
  dlgConfirm: { backgroundColor: accent.primary },
  dlgDanger: { backgroundColor: DANGER },
  dlgSolidText: { fontFamily: fonts.medium, fontSize: 14, color: accent.onAccent },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});

export default HouseholdSection;
