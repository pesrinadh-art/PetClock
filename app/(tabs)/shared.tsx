import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TopNavBar } from '../../components/TopNavBar';
import { Card, HeroCard, Screen, SectionLabel, TAB_BAR_CLEARANCE } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { HouseholdSection } from '../../components/HouseholdSection';
import { useSession } from '../../context/SessionContext';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { getSupabaseClient } from '../../lib/db/client';
import { getHouseholdName, type Member } from '../../lib/household/invites';
import { joinPetNames } from '../../lib/petNames';
import { possessive as possessiveOf } from '../../lib/petVoice';
import { accent, glass, ink, radius, warn } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

/**
 * FAMILY tab (Aurora Minimal v2; was "Shared") — the household-sharing flagship. Glass hero like
 * every other tab, plus a "How sharing works" explainer.
 *
 * The whole product rests on two caregivers, one dog, one shared prediction. This screen is
 * where that household is created and grown: a green hero summarising who's caring for the
 * pets, an invite-code card (share + copy) wired to `createInvite`, a live Members list with
 * roles and owner controls (remove / revoke) plus Leave, and a join-by-code flow — all
 * driven by the helpers in `lib/household/invites.ts` through `components/HouseholdSection`.
 *
 * Sharing only exists in synced mode; in local mode there is no household on the server to
 * invite anyone into, so we show a welcoming explainer instead of an empty management UI.
 */
export default function SharedScreen() {
  const { synced, householdId } = useSession();
  const { pets, activePet } = usePets();
  const { logs } = useLogs();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);

  const isShared = synced && !!householdId;

  // Read the real household name for the hero. Best-effort: on any miss we fall back to the
  // generic "Your household" title below.
  useEffect(() => {
    if (!isShared || !householdId) {
      setHouseholdName(null);
      return;
    }
    let live = true;
    void getHouseholdName(getSupabaseClient(), householdId).then((n) => {
      if (live) setHouseholdName(n);
    });
    return () => {
      live = false;
    };
  }, [isShared, householdId]);

  const logsToday = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter(
      (l) => !l.deletedAt && l.occurredAt && new Date(l.occurredAt).toDateString() === today,
    ).length;
  }, [logs]);

  const petsShared = pets.length;
  const names = pets.length > 0 ? joinPetNames(pets.map((p) => p.name)) : 'your pets';
  const possessive = pets.length > 0 ? possessiveOf(names) : "your pets'";

  return (
    <Screen edges={['top']}>
      <TopNavBar pet={activePet} eyebrow="Care team" title="Family" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isShared ? (
          <>
            <HeroCard
              eyebrow="Everyone caring for your pets"
              title={householdName ?? 'Your household'}
              stats={[
                { value: memberCount == null ? '—' : String(memberCount), label: 'Members' },
                { value: String(petsShared), label: petsShared === 1 ? 'Pet shared' : 'Pets shared' },
                { value: String(logsToday), label: 'Logs today' },
              ]}
            />

            <Text style={styles.blurb}>
              Share this household so every caregiver gets the same reminders. Whoever answers
              first logs it — the other phones just update.
            </Text>

            <HouseholdSection onMembersLoaded={(m: Member[]) => setMemberCount(m.length)} />
          </>
        ) : (
          <>
            <HeroCard
              eyebrow="Care together"
              title={`Share ${possessive} care`}
              subtitle="Invite a partner, family member, sitter or dog walker."
            />

            <View style={styles.notice}>
              <View style={styles.noticeIcon}>
                <Icon name="lock" size={17} color={warn.ink} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>Sharing needs sync turned on</Text>
                <Text style={styles.noticeBody}>
                  Once this phone is signed in and syncing, you can invite helpers with a code.
                  Everyone then sees the same pets, reminders and logs.
                </Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.section}>
          <SectionLabel>How sharing works</SectionLabel>
          <Card style={styles.how}>
            <HowRow
              icon="userPlus"
              title="Invite a helper"
              body="Send them a short code. It works for a few days, then expires."
            />
            <HowRow
              icon="bell"
              title="Everyone gets the nudge"
              body={`All phones get ${possessive} potty, meal and med reminders.`}
            />
            <HowRow
              icon="check"
              title="First one to answer logs it"
              body="The other phones update on their own. No double logging."
              last
            />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function HowRow({
  icon,
  title,
  body,
  last = false,
}: {
  icon: IconName;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.howRow, !last && styles.howDivider]}>
      <View style={styles.howIcon}>
        <Icon name={icon} size={17} color={accent.ink} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.howTitle}>{title}</Text>
        <Text style={styles.howBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: TAB_BAR_CLEARANCE },
  blurb: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: ink.muted,
    lineHeight: 19,
    marginTop: 16,
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: warn.soft,
    borderWidth: 1,
    borderColor: warn.line,
  },
  noticeIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: glass.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    letterSpacing: -0.2,
    color: ink.primary,
    marginBottom: 3,
  },
  noticeBody: { fontFamily: fonts.regular, fontSize: 13, color: ink.muted, lineHeight: 19 },
  section: { marginTop: 26 },
  how: { paddingHorizontal: 16 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  howDivider: { borderBottomWidth: 1, borderBottomColor: glass.border },
  howIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howTitle: { fontFamily: fonts.medium, fontSize: 14, letterSpacing: -0.15, color: ink.primary },
  howBody: { fontFamily: fonts.regular, fontSize: 13, color: ink.muted, lineHeight: 19, marginTop: 2 },
});