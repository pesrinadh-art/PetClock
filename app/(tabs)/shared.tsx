import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopNavBar } from '../../components/TopNavBar';
import { Card, HeroCard } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { HouseholdSection } from '../../components/HouseholdSection';
import { useSession } from '../../context/SessionContext';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import type { Member } from '../../lib/household/invites';
import { green, ink, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

/**
 * SHARED tab — the household-sharing flagship (mockup screen_2h).
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
  const { pets } = usePets();
  const { logs } = useLogs();
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const isShared = synced && !!householdId;

  const logsToday = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter(
      (l) => !l.deletedAt && l.occurredAt && new Date(l.occurredAt).toDateString() === today,
    ).length;
  }, [logs]);

  const petsShared = pets.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isShared ? (
          <>
            <HeroCard
              eyebrow="Everyone caring for your pets"
              title="Your household"
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
              eyebrow="Care for your pets together"
              title="Share your household"
              subtitle="Invite a partner, sitter or dog walker"
            />

            <View style={{ height: 20 }} />

            <Card padded style={styles.notice}>
              <View style={styles.noticeIcon}>
                <Icon name="users" size={20} color={green.primary} strokeWidth={2} />
              </View>
              <Text style={styles.noticeTitle}>Sharing needs sync turned on</Text>
              <Text style={styles.noticeBody}>
                Household sharing keeps two phones on one set of pets, reminders and logs. It
                becomes available once this device is signed in and syncing — then you can create
                an invite code, add caregivers and manage who has access, right here.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  blurb: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: ink.muted,
    lineHeight: 18,
    marginBottom: 16,
  },
  notice: { alignItems: 'center' },
  noticeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  noticeTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: ink.primary,
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  noticeBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: ink.muted,
    lineHeight: 19,
    textAlign: 'center',
  },
});
