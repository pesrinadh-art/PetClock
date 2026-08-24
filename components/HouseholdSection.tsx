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
import { amber, green, ink, line, radius, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';

/** The `member_role` enum in caregiver terms — the DB never stores presentation strings. */
const ROLE_LABEL: Record<InviteRole, string> = {
  owner: 'Owner',
  member: 'Caregiver',
  walker: 'Walker',
};

/** Role → pill palette. Owner reads as brand-green; a time-boxed walker as amber attention. */
const ROLE_PILL: Record<InviteRole, { bg: string; color: string }> = {
  owner: { bg: green.tint, color: green.primary },
  member: { bg: surface.chip, color: ink.muted },
  walker: { bg: amber.warnBg, color: amber.warnInk },
};

/** A settled message shown under the section: success reads calm, error reads alarming. */
type Notice = { text: string; error?: boolean };

/** Destructive accent for remove/leave/revoke — a role token; theme/colors.ts is off-limits here. */
const DANGER = '#c0392b';

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

  return (
    <>
      {/* ── Invite code ─────────────────────────────────────────────── */}
      <SectionLabel>Invite code</SectionLabel>
      {invite ? (
        <Card padded style={styles.inviteCard}>
          <View style={styles.inviteHead}>
            <View style={styles.keyTile}>
              <Icon name="key" size={16} color={amber.warnInk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteLabel}>Invite code</Text>
              <Text
                style={styles.code}
                selectable
                accessibilityLabel={`Invite code ${invite.code}`}
              >
                {invite.code}
              </Text>
            </View>
          </View>

          <View style={styles.inviteBtns}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
              onPress={() => void shareInvite()}
              role="button"
              aria-label="Share invite"
            >
              <Icon name="share" size={14} color={ink.onDark} strokeWidth={2.2} />
              <Text style={styles.btnPrimaryText}>{shared ? 'Shared!' : 'Share invite'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
              onPress={() => void copyInvite()}
              role="button"
              aria-label="Copy code"
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} color={ink.muted} strokeWidth={2.2} />
              <Text style={styles.btnGhostText}>{copied ? 'Copied!' : 'Copy code'}</Text>
            </Pressable>
          </View>

          <View style={styles.inviteFootRow}>
            <Text style={styles.inviteFoot}>
              {invite.maxUses - invite.useCount} use
              {invite.maxUses - invite.useCount === 1 ? '' : 's'} left · expires{' '}
              {new Date(invite.expiresAt).toLocaleDateString()}
            </Text>
            <Pressable
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
          </View>
        </Card>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.mintCta, pressed && styles.pressed]}
          onPress={() => void mint()}
          disabled={minting}
          role="button"
          aria-label="Create an invite code"
        >
          {minting ? (
            <ActivityIndicator color={green.mid} />
          ) : (
            <>
              <Icon name="userPlus" size={16} color={green.mid} strokeWidth={2.2} />
              <Text style={styles.mintCtaText}>Invite a caregiver</Text>
            </>
          )}
        </Pressable>
      )}

      <Pressable
        style={styles.joinLink}
        onPress={() => {
          setMessage(null);
          setJoinOpen(true);
        }}
        role="button"
        aria-label="Join a household with a code"
        hitSlop={6}
      >
        <Text style={styles.joinLinkText}>
          Have a code? <Text style={styles.joinLinkStrong}>Join a household</Text>
        </Text>
      </Pressable>

      {/* ── Members ─────────────────────────────────────────────────── */}
      <View style={{ height: 18 }} />
      <SectionLabel>Members</SectionLabel>
      {membersLoading && members.length === 0 ? (
        <Card padded style={styles.stateCard}>
          <ActivityIndicator color={green.mid} />
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
            const expires = m.memberExpiresAt
              ? ` · access until ${new Date(m.memberExpiresAt).toLocaleDateString()}`
              : '';
            return (
              <View key={m.userId}>
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, isYou && styles.avatarYou]}>
                    <Icon name="user" size={16} color={isYou ? ink.onDark : ink.faint2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {ROLE_LABEL[m.role]}
                      {isYou ? <Text style={styles.youTag}> · you</Text> : null}
                    </Text>
                    <Text style={styles.memberSub} numberOfLines={1}>
                      Joined {new Date(m.joinedAt).toLocaleDateString()}
                      {expires}
                    </Text>
                  </View>
                  <View style={styles.memberRight}>
                    <Pill label={ROLE_LABEL[m.role]} bg={pill.bg} color={pill.color} size="sm" />
                    {isYou ? (
                      <Pressable
                        onPress={() => {
                          setMessage(null);
                          setLeaveOpen(true);
                        }}
                        hitSlop={6}
                        role="button"
                        aria-label="Leave household"
                      >
                        <Text style={styles.rowAction}>Leave</Text>
                      </Pressable>
                    ) : isOwner ? (
                      <Pressable
                        onPress={() => {
                          setMessage(null);
                          setRemoveTarget(m);
                        }}
                        hitSlop={6}
                        role="button"
                        aria-label={`Remove ${ROLE_LABEL[m.role]}`}
                      >
                        <Text style={styles.rowAction}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
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
            <GlassSurface fallbackColor={surface.card} fallbackOpacity={1} style={styles.dialog}>
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
                    <Text style={styles.dlgDangerText}>Remove</Text>
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
            <GlassSurface fallbackColor={surface.card} fallbackOpacity={1} style={styles.dialog}>
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
                    <Text style={styles.dlgDangerText}>Leave</Text>
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
            <GlassSurface fallbackColor={surface.card} fallbackOpacity={1} style={styles.dialog}>
              <Text style={styles.dialogTitle}>Join a household</Text>
              <Text style={styles.dialogBody}>
                This device will switch to their pets and reminders. Anything you added here first
                stays behind on your own household.
              </Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={ink.faint}
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
                    <ActivityIndicator color={ink.onDark} />
                  ) : (
                    <Text style={styles.dlgConfirmText}>Join</Text>
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
  // Invite code card
  inviteCard: {},
  inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  keyTile: {
    width: 30,
    height: 30,
    borderRadius: radius.iconTileSm,
    backgroundColor: amber.warnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ink.faint2,
  },
  code: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    letterSpacing: 3,
    color: ink.primary,
    marginTop: 1,
  },
  inviteBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: radius.tile,
  },
  btnPrimary: { backgroundColor: green.mid },
  btnPrimaryText: { fontFamily: fonts.bold, fontSize: 13, color: ink.onDark },
  btnGhost: { backgroundColor: surface.field },
  btnGhostText: { fontFamily: fonts.semiBold, fontSize: 13, color: ink.muted },
  inviteFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
    gap: 12,
  },
  inviteFoot: { flex: 1, fontFamily: fonts.medium, fontSize: 11.5, color: ink.faint2, lineHeight: 16 },
  revokeText: { fontFamily: fonts.bold, fontSize: 12, color: DANGER },

  // Create-invite CTA
  mintCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: green.tintBorder,
    backgroundColor: green.tint,
  },
  mintCtaText: { fontFamily: fonts.bold, fontSize: 13.5, color: green.primary },

  joinLink: { alignSelf: 'center', paddingVertical: 12 },
  joinLinkText: { fontFamily: fonts.medium, fontSize: 12.5, color: ink.muted },
  joinLinkStrong: { fontFamily: fonts.bold, color: green.primary },

  // Members
  stateCard: { alignItems: 'center' },
  errorText: { fontFamily: fonts.medium, fontSize: 12.5, color: DANGER, lineHeight: 18 },
  emptyText: { fontFamily: fonts.medium, fontSize: 12.5, color: ink.muted, lineHeight: 18 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: { backgroundColor: green.mid },
  memberName: { fontFamily: fonts.bold, fontSize: 14, color: ink.primary },
  youTag: { fontFamily: fonts.medium, color: ink.faint2 },
  memberSub: { fontFamily: fonts.medium, fontSize: 12, color: ink.muted, marginTop: 2 },
  memberRight: { alignItems: 'flex-end', gap: 6 },
  rowAction: { fontFamily: fonts.bold, fontSize: 11.5, color: DANGER },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 16 },

  message: { fontFamily: fonts.medium, fontSize: 12.5, color: green.primary, lineHeight: 18, marginTop: 12, paddingHorizontal: 2 },
  messageError: { color: DANGER },

  // Dialogs
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(42,39,36,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialogWrap: { width: '100%', maxWidth: 340 },
  dialog: { borderRadius: radius.sheet, padding: 22 },
  dialogTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: ink.primary, letterSpacing: -0.3, marginBottom: 8 },
  dialogBody: { fontFamily: fonts.medium, fontSize: 13, color: ink.muted, lineHeight: 19, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: line.border,
    backgroundColor: surface.field,
    borderRadius: radius.tile,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    letterSpacing: 3,
    textAlign: 'center',
    color: ink.primary,
    marginBottom: 18,
  },
  dialogActions: { flexDirection: 'row', gap: 10 },
  dlgBtn: { flex: 1, borderRadius: radius.tile, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  dlgCancel: { backgroundColor: surface.field },
  dlgCancelText: { fontFamily: fonts.bold, fontSize: 13, color: ink.muted },
  dlgConfirm: { backgroundColor: green.mid },
  dlgConfirmText: { fontFamily: fonts.bold, fontSize: 13, color: ink.onDark },
  dlgDanger: { backgroundColor: DANGER },
  dlgDangerText: { fontFamily: fonts.bold, fontSize: 13, color: ink.onDark },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});

export default HouseholdSection;
