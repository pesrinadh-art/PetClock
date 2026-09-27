import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Button, Card, IconTile, PetEmptyState, Pill, SectionLabel } from './ui';
import { Icon, type IconName } from './Icon';
import { ConfirmDialog } from './settings/ConfirmDialog';
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
import { possessive } from '../lib/petVoice';
import { green, ink, line, radius, space, surface, tap, terracotta, type Tone } from '../theme/colors';
import { fonts, type } from '../theme/fonts';

/** The `member_role` enum in caregiver terms — the DB never stores presentation strings. */
const ROLE_LABEL: Record<InviteRole, string> = {
  owner: 'Owner',
  member: 'Caregiver',
  walker: 'Walker',
};

/** What each role can do, in plain words (shown on each row and in "Who can do what"). */
const ROLE_PLAIN: Record<InviteRole, string> = {
  owner: 'Runs the family: invites people and manages pets.',
  member: 'Logs care and gets every reminder.',
  walker: 'Short-term help. Access ends on a set date.',
};

/** Role → tone + icon. Owner reads as pet-green; a time-boxed walker as amber attention. */
const ROLE_STYLE: Record<InviteRole, { tone: Tone; icon: IconName }> = {
  owner: { tone: 'pet', icon: 'key' },
  member: { tone: 'neutral', icon: 'heart' },
  walker: { tone: 'attention', icon: 'leash' },
};

/** A settled message shown under the team list: success reads calm, errors read gentle. */
type Notice = { text: string; error?: boolean };

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

/**
 * The pet's care team: invite a helper with a code, see who helps (with roles in plain
 * words), join someone else's family, and — clearly separated at the bottom — leave.
 *
 * Presentation-only redesign: every handler, RPC and state transition is unchanged.
 */
export function HouseholdSection({
  onMembersLoaded,
  petName,
}: {
  /** Lets a host screen (the Family tab hero) reflect the live member count. */
  onMembersLoaded?: (members: Member[]) => void;
  /** Pet name(s) for warmer copy ("Mochi", "Mochi & Luna"). Optional; falls back to generic. */
  petName?: string | null;
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
  const amMember = members.some((m) => m.userId === currentUserId);

  const petWord = petName && petName.trim() ? petName : 'your pets';
  const familyWord = petName && petName.trim() ? `${possessive(petName)} family` : 'this family';

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
      setMessage({ text: "Code turned off. It won't work any more." });
    } catch (e) {
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setRevoking(false);
    }
  };

  const shareInvite = async () => {
    if (!invite) return;
    const text = `Help look after ${petName?.trim() ? petName : "our pets"} on PawClock. Join with code ${invite.code}`;
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
      await Share.share({ message: `Help look after ${petName?.trim() ? petName : "our pets"} on PawClock. Join with code ${invite.code}` });
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
      setMessage({ text: `Done. They won't see ${possessive(petWord)} reminders any more.` });
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
      setMessage({ text: "You've left the family. This phone will move to a fresh one of its own." });
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
          ? `You're in! You now share ${possessive(petWord)} care with your partner.`
          : "You're in! Your old family still has pets, so we kept it too.",
      });
      await loadMembers();
    } catch (e) {
      setMessage({ text: householdErrorMessage(e), error: true });
    } finally {
      setJoining(false);
    }
  };

  const openJoin = () => {
    setMessage(null);
    setJoinOpen(true);
  };

  const usesLeft = invite ? invite.maxUses - invite.useCount : 0;

  return (
    <>
      {/* ── Invite a helper ─────────────────────────────────────────── */}
      <SectionLabel hint={`A partner, sitter or walker can help with ${petWord}.`}>
        Invite a helper
      </SectionLabel>
      {invite ? (
        <Card padded>
          <Text style={styles.codeLabel}>Your invite code</Text>
          <View style={styles.codeWell}>
            <Text
              style={styles.code}
              selectable
              accessibilityLabel={`Invite code ${invite.code}`}
            >
              {invite.code}
            </Text>
          </View>
          <View style={styles.codeMeta}>
            <Icon name="clock" size={15} color={ink.muted} strokeWidth={2.2} />
            <Text style={styles.codeMetaText}>
              {usesLeft} use{usesLeft === 1 ? '' : 's'} left · works until {shortDate(invite.expiresAt)}
            </Text>
          </View>

          <View style={styles.inviteBtns}>
            <Button
              label={shared ? 'Shared!' : 'Share invite'}
              accessibilityLabel="Share invite"
              icon={shared ? 'check' : 'share'}
              onPress={() => void shareInvite()}
              fullWidth
            />
            <Button
              label={copied ? 'Copied!' : 'Copy code'}
              accessibilityLabel="Copy code"
              icon={copied ? 'check' : 'copy'}
              variant="secondary"
              size="md"
              onPress={() => void copyInvite()}
              fullWidth
            />
          </View>

          <Pressable
            onPress={() => void revoke()}
            disabled={revoking}
            role="button"
            aria-label="Revoke invite code"
            style={({ pressed }) => [styles.revoke, pressed && styles.pressed]}
          >
            {revoking ? (
              <ActivityIndicator color={terracotta.ink} size="small" />
            ) : (
              <>
                <Icon name="close" size={16} color={terracotta.ink} strokeWidth={2.3} />
                <Text style={styles.revokeText}>Turn off this code</Text>
              </>
            )}
          </Pressable>
        </Card>
      ) : (
        <Card padded>
          <View style={styles.inviteIntro}>
            <IconTile icon="userPlus" tone="pet" size={44} />
            <Text style={styles.inviteIntroText}>
              We&apos;ll make a short code you can text to them. They type it in and they&apos;re in.
            </Text>
          </View>
          <Button
            label="Get an invite code"
            accessibilityLabel="Create an invite code"
            icon="userPlus"
            onPress={() => void mint()}
            loading={minting}
            fullWidth
            style={styles.inviteCta}
          />
        </Card>
      )}

      <Button
        label="I have a code to join"
        accessibilityLabel="Join a household with a code"
        icon="key"
        variant="ghost"
        size="md"
        onPress={openJoin}
        fullWidth
        style={styles.joinBtn}
      />

      {/* ── The team ────────────────────────────────────────────────── */}
      <View style={styles.gap} />
      <SectionLabel>{`Who's helping`}</SectionLabel>
      {membersLoading && members.length === 0 ? (
        <Card padded style={styles.stateCard}>
          <ActivityIndicator color={green.mid} />
          <Text style={styles.loadingText}>Finding everyone…</Text>
        </Card>
      ) : membersError ? (
        <Banner
          tone="attention"
          icon="alert"
          title="We couldn't load the team just now"
          body={membersError}
          action={{ label: 'Try again', onPress: () => void loadMembers() }}
        />
      ) : members.length === 0 ? (
        <PetEmptyState
          variant="card"
          icon="users"
          title="No helpers yet"
          body={`Invite someone and they'll show up here, ready to help with ${petWord}.`}
          action={invite ? undefined : { label: 'Get an invite code', icon: 'userPlus', onPress: () => void mint() }}
        />
      ) : (
        <Card>
          {members.map((m, i) => {
            const isYou = m.userId === currentUserId;
            const rs = ROLE_STYLE[m.role];
            const sub = m.memberExpiresAt
              ? `Joined ${shortDate(m.joinedAt)} · access until ${shortDate(m.memberExpiresAt)}`
              : `Joined ${shortDate(m.joinedAt)}`;
            return (
              <View key={m.userId}>
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, isYou && styles.avatarYou]}>
                    <Icon name="user" size={20} color={isYou ? ink.onDark : ink.muted} strokeWidth={2.2} />
                  </View>
                  <View style={styles.memberText}>
                    <View style={styles.memberTitleRow}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {isYou ? 'You' : ROLE_LABEL[m.role]}
                      </Text>
                      <Pill tone={rs.tone} icon={rs.icon} label={ROLE_LABEL[m.role]} size="sm" />
                    </View>
                    <Text style={styles.memberSub} numberOfLines={2}>
                      {ROLE_PLAIN[m.role]}
                    </Text>
                    <Text style={styles.memberMeta} numberOfLines={1}>
                      {sub}
                    </Text>
                  </View>
                  {!isYou && isOwner ? (
                    <Pressable
                      onPress={() => {
                        setMessage(null);
                        setRemoveTarget(m);
                      }}
                      hitSlop={tap.hitSlop}
                      role="button"
                      aria-label={`Remove ${ROLE_LABEL[m.role]}`}
                      style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.removeText}>Remove</Text>
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
        <Banner
          compact
          tone={message.error ? 'attention' : 'pet'}
          icon={message.error ? 'alert' : 'check'}
          title={message.text}
          style={styles.message}
        />
      ) : null}

      {/* ── Roles, in plain words ───────────────────────────────────── */}
      <View style={styles.gap} />
      <SectionLabel>Who can do what</SectionLabel>
      <Card padded>
        {(Object.keys(ROLE_LABEL) as InviteRole[]).map((r, i) => (
          <View key={r} style={[styles.roleRow, i > 0 && styles.roleRowGap]}>
            <IconTile icon={ROLE_STYLE[r].icon} tone={ROLE_STYLE[r].tone} size={40} />
            <View style={styles.memberText}>
              <Text style={styles.roleName}>{ROLE_LABEL[r]}</Text>
              <Text style={styles.memberSub}>{ROLE_PLAIN[r]}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.roleFoot}>New invites join as caregivers.</Text>
      </Card>

      {/* ── Leave (separated, confirmed) ────────────────────────────── */}
      {amMember ? (
        <>
          <View style={styles.gap} />
          <SectionLabel>Leaving</SectionLabel>
          <Card>
            <Pressable
              onPress={() => {
                setMessage(null);
                setLeaveOpen(true);
              }}
              role="button"
              aria-label="Leave household"
              style={({ pressed }) => [styles.leaveRow, pressed && styles.rowPressed]}
            >
              <IconTile icon="login" tone="food" size={40} />
              <View style={styles.memberText}>
                <Text style={styles.leaveTitle}>Leave {familyWord}</Text>
                <Text style={styles.memberSub}>
                  This phone stops getting {possessive(petWord)} reminders. We&apos;ll ask first.
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={ink.placeholder} strokeWidth={2.3} />
            </Pressable>
          </Card>
        </>
      ) : null}

      {/* ── Confirm: remove ─────────────────────────────────────────── */}
      <ConfirmDialog
        visible={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        destructive
        icon="user"
        title={`Remove this ${removeTarget ? ROLE_LABEL[removeTarget.role].toLowerCase() : 'member'}?`}
        body={`They'll stop seeing ${possessive(petWord)} reminders and logs right away. You can invite them again any time with a new code.`}
        confirmLabel={`Remove ${removeTarget ? ROLE_LABEL[removeTarget.role].toLowerCase() : 'helper'}`}
        confirmAccessibilityLabel="Remove"
        onConfirm={() => void confirmRemove()}
        loading={removing}
        cancelLabel="Keep them"
      />

      {/* ── Confirm: leave ──────────────────────────────────────────── */}
      <ConfirmDialog
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        destructive
        icon="login"
        title={`Leave ${familyWord}?`}
        body={`This phone will stop seeing ${possessive(petWord)} reminders and logs, and move to a fresh family of its own. If you're the only owner, hand the pets to someone first.`}
        confirmLabel="Leave family"
        confirmAccessibilityLabel="Leave household"
        onConfirm={() => void confirmLeave()}
        loading={leaving}
        cancelLabel="Stay"
      />

      {/* ── Join with a code ────────────────────────────────────────── */}
      <ConfirmDialog
        visible={joinOpen}
        onClose={() => setJoinOpen(false)}
        icon="key"
        title="Join a family"
        body="Type the code you were sent. This phone will switch to their pets and reminders. Anything you added here stays safe in your own family."
        confirmLabel="Join family"
        confirmAccessibilityLabel="Join"
        onConfirm={() => void submitJoin()}
        confirmDisabled={!code.trim()}
        loading={joining}
        cancelLabel="Cancel"
      >
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
      </ConfirmDialog>
    </>
  );
}

const styles = StyleSheet.create({
  gap: { height: space.section },
  pressed: { opacity: 0.7 },
  rowPressed: { backgroundColor: surface.field },

  // Invite
  inviteIntro: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inviteIntroText: { ...type.body, color: ink.muted, flex: 1, minWidth: 0 },
  inviteCta: { marginTop: space.lg },
  codeLabel: { ...type.subhead, color: ink.primary },
  codeWell: {
    marginTop: space.xs,
    backgroundColor: green.wash,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: green.tintBorder,
    borderRadius: radius.tile,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  code: { fontFamily: fonts.mono, fontSize: 30, letterSpacing: 6, color: green.primary },
  codeMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xs },
  codeMetaText: { ...type.bodySm, color: ink.muted, flex: 1 },
  inviteBtns: { gap: space.xs, marginTop: space.lg },
  revoke: {
    minHeight: tap.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: space.xxs,
  },
  revokeText: { ...type.bodySm, fontFamily: fonts.bold, color: terracotta.ink },
  joinBtn: { marginTop: space.xs },

  // Team
  stateCard: { alignItems: 'center', gap: space.xs },
  loadingText: { ...type.bodySm, color: ink.muted },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 72,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarYou: { backgroundColor: green.mid },
  memberText: { flex: 1, minWidth: 0 },
  memberTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  memberName: { ...type.subhead, color: ink.primary },
  memberSub: { ...type.bodySm, color: ink.muted, marginTop: 2 },
  memberMeta: { ...type.caption, color: ink.faint, marginTop: 2 },
  removeBtn: {
    minHeight: tap.min,
    minWidth: tap.min,
    paddingHorizontal: space.sm,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: terracotta.tintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { ...type.bodySm, fontFamily: fonts.bold, color: terracotta.ink },
  divider: { height: 1, backgroundColor: line.hairline, marginLeft: space.lg + 44 + space.sm, marginRight: space.lg },
  message: { marginTop: space.sm },

  // Roles
  roleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  roleRowGap: { marginTop: space.md },
  roleName: { ...type.subhead, color: ink.primary },
  roleFoot: { ...type.caption, color: ink.faint, marginTop: space.lg },

  // Leave
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 72,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  leaveTitle: { ...type.subhead, color: terracotta.ink },

  // Join input
  input: {
    minHeight: 60,
    borderWidth: 1.5,
    borderColor: line.border,
    backgroundColor: surface.field,
    borderRadius: radius.tile,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    fontFamily: fonts.mono,
    fontSize: 24,
    letterSpacing: 5,
    textAlign: 'center',
    color: ink.primary,
  },
});

export default HouseholdSection;
