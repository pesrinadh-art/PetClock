import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopNavBar } from '../../components/TopNavBar';
import { Card, HeroCard, SectionLabel } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { HouseholdSection } from '../../components/HouseholdSection';
import { useSession } from '../../context/SessionContext';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { getSupabaseClient } from '../../lib/db/client';
import { getHouseholdName, type Member } from '../../lib/household/invites';
import { joinPetNames } from '../../lib/petNames';
import { possessive as possessiveOf } from '../../lib/petVoice';
import { amber, green, ink, radius, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

/**
 * FAMILY tab (redesign v3; was "Shared") — the household-sharing flagship. Green hero like every
 * other tab, plus a "How sharing works" explainer.
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
    <SafeAreaView style={styles.safe} edges={['top']}>
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

            <View style={{ height: 20 }} />

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
              <Icon name="lock" size={22} color={amber.warnInk} strokeWidth={2} />
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
          <Card padded style={styles.how}>
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
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HowRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howIcon}>
        <Icon name={icon} size={19} color={green.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.howTitle}>{title}</Text>
        <Text style={styles.howBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 80 },
  blurb: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: ink.muted,
    lineHeight: 18,
    marginBottom: 16,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginTop: 20,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: amber.warnBg,
    borderWidth: 1,
    borderColor: '#f3dfb9',
  },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 15.5, color: ink.primary, marginBottom: 4 },
  noticeBody: { fontFamily: fonts.medium, fontSize: 13, color: ink.muted, lineHeight: 19 },
  section: { marginTop: 26 },
  how: { gap: 18, paddingVertical: 18 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  howIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.iconTile,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howTitle: { fontFamily: fonts.bold, fontSize: 15, color: ink.primary },
  howBody: { fontFamily: fonts.medium, fontSize: 13, color: ink.muted, lineHeight: 19, marginTop: 2 },
});
