import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TopNavBar } from '../../components/TopNavBar';
import { Card, HeroCard, Screen, SectionLabel, IconTile } from '../../components/ui';
import { PetAvatar } from '../../components/PetAvatar';
import { HouseholdSection } from '../../components/HouseholdSection';
import { useSession } from '../../context/SessionContext';
import { usePets } from '../../context/PetsContext';
import { useLogs } from '../../context/LogsContext';
import { getSupabaseClient } from '../../lib/db/client';
import { getHouseholdName, type Member } from '../../lib/household/invites';
import { joinNames, possessive } from '../../lib/petVoice';
import { ink, space } from '../../theme/colors';
import { type } from '../../theme/fonts';
import type { IconName } from '../../components/Icon';

/**
 * FAMILY tab (route: shared) — the pet's care team.
 *
 * Framed around the pet, not the "household": "Mochi's family" is everyone who helps look
 * after Mochi. The hero shows the pets being cared for plus live team stats; the body walks
 * the owner through how sharing works, then hands off to `HouseholdSection` for the invite
 * code, the team list with roles in plain words, and the join / leave flows.
 *
 * Sharing only exists in synced mode; in local mode there is no household on the server to
 * invite anyone into, so we show a friendly explainer instead of an empty management UI.
 *
 * Behaviour is unchanged from the previous design: same session / pets / logs reads, same
 * best-effort household-name fetch, same member-count callback.
 */
export default function SharedScreen() {
  const { synced, householdId } = useSession();
  const { pets, activePet } = usePets();
  const { logs } = useLogs();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);

  const isShared = synced && !!householdId;

  // Read the real household name for the hero. Best-effort: on any miss we fall back to the
  // pet-first title below.
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
  // "Mochi", "Mochi & Luna", "A, B & C" — or a generic fallback with no pets (or so many
  // that the names would overflow the header).
  const petNames =
    pets.length > 0 && pets.length <= 3 ? joinNames(pets.map((p) => p.name)) : null;
  const familyTitle = petNames ? `${possessive(petNames)} family` : 'Your pet family';
  const helpers = memberCount == null ? null : memberCount;
  const petWord = petNames ?? 'your pets';

  // Up to three stacked avatars in the hero; one PetAvatar component per pet (hook rules).
  const heroPets = pets.slice(0, 3);
  const heroLeading =
    heroPets.length > 0 ? (
      <View style={styles.avatarStack}>
        {heroPets.map((p, i) => (
          <View key={p.id} style={i > 0 ? styles.avatarOverlap : undefined}>
            <PetAvatar pet={p} size={heroPets.length === 1 ? 60 : 48} ring="onDark" />
          </View>
        ))}
      </View>
    ) : undefined;

  return (
    <Screen
      tabBar
      header={
        <TopNavBar pet={activePet} eyebrow="Care team" title="Family" />
      }
    >
      {isShared ? (
        <>
          <HeroCard
            eyebrow={householdName ?? 'Everyone who helps'}
            title={familyTitle}
            subtitle={
              helpers != null && helpers <= 1
                ? `Right now it's just you. Invite someone to help with ${petWord}.`
                : `Everyone here gets the same reminders and sees every log.`
            }
            leading={heroLeading}
            stats={[
              {
                value: memberCount == null ? '—' : String(memberCount),
                label: memberCount === 1 ? 'Helper' : 'Helpers',
              },
              { value: String(petsShared), label: petsShared === 1 ? 'Pet' : 'Pets' },
              { value: String(logsToday), label: 'Logs today' },
            ]}
          />

          <View style={styles.gap} />

          <HowItWorks petWord={petWord} />

          <View style={styles.gap} />

          <HouseholdSection
            petName={petNames}
            onMembersLoaded={(m: Member[]) => setMemberCount(m.length)}
          />
        </>
      ) : (
        <>
          <HeroCard
            eyebrow="Care together"
            title={petNames ? `Share ${possessive(petNames)} care` : 'Share the care'}
            subtitle="Invite a partner, family member, sitter or dog walker."
            leading={heroLeading}
          />

          <View style={styles.gap} />

          <Card padded tone="attention">
            <View style={styles.noticeTop}>
              <IconTile icon="lock" tone="attention" size={44} />
              <View style={styles.noticeText}>
                <Text style={styles.noticeTitle}>Sharing needs sync turned on</Text>
                <Text style={styles.noticeBody}>
                  Once this phone is signed in and syncing, you can invite helpers with a code.
                  Everyone then sees the same pets, reminders and logs.
                </Text>
              </View>
            </View>
          </Card>

          <View style={styles.gap} />

          <HowItWorks petWord={petWord} />
        </>
      )}
    </Screen>
  );
}

/** Three plain-language steps that explain sharing before the owner commits to anything. */
function HowItWorks({ petWord }: { petWord: string }) {
  const steps: { icon: IconName; title: string; body: string }[] = [
    {
      icon: 'userPlus',
      title: 'Invite a helper',
      body: 'Send them a short code. It works for a few days, then expires.',
    },
    {
      icon: 'bell',
      title: 'Everyone gets the nudge',
      body: `All phones get ${possessive(petWord)} potty, meal and med reminders.`,
    },
    {
      icon: 'check',
      title: 'First one to answer logs it',
      body: 'The other phones update on their own. No double logging.',
    },
  ];
  return (
    <>
      <SectionLabel>How sharing works</SectionLabel>
      <Card padded>
        {steps.map((s, i) => (
          <View key={s.title} style={[styles.step, i > 0 && styles.stepGap]}>
            <IconTile icon={s.icon} tone="pet" size={40} />
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  gap: { height: space.section },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarOverlap: { marginLeft: -14 },

  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  stepGap: { marginTop: space.lg },
  stepText: { flex: 1, minWidth: 0 },
  stepTitle: { ...type.subhead, color: ink.primary },
  stepBody: { ...type.bodySm, color: ink.muted, marginTop: 2 },

  noticeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  noticeText: { flex: 1, minWidth: 0 },
  noticeTitle: { ...type.subhead, color: ink.primary },
  noticeBody: { ...type.bodySm, color: ink.muted, marginTop: 4 },
});
