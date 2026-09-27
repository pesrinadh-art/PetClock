import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import { NudgeActionButtons, nudgeLateness } from '../components/NudgeBanner';
import { PetAvatar } from '../components/PetAvatar';
import type { IconName } from '../components/Icon';
import { Card, IconTile, ListRow, PetEmptyState, Pill, Screen, ScreenHeader, SectionLabel } from '../components/ui';
import { useLogs } from '../context/LogsContext';
import { usePets } from '../context/PetsContext';
import { useNow } from '../hooks/useNow';
import { usePendingNudges } from '../hooks/usePendingNudges';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import type { PendingNudge } from '../lib/notifications/pending';
import { listScheduledSummaries, type ScheduledSummary } from '../lib/notifications/scheduler';
import { repos } from '../lib/repo/types';
import { formatClock } from '../lib/petSchedule';
import { friendlyAgo, friendlyIn, joinNames } from '../lib/petVoice';
import { ink, space, type Tone } from '../theme/colors';
import { type } from '../theme/fonts';

/** "2:15 PM" for today, else "Mon 2:15 PM" — a human "when" for a scheduled reminder. */
function whenLabel(fireAt: Date, now: Date): string {
  const sameDay = fireAt.toDateString() === now.toDateString();
  const clock = formatClock(fireAt);
  if (sameDay) return clock;
  const day = fireAt.toLocaleDateString([], { weekday: 'short' });
  return `${day} ${clock}`;
}

/** Icon + tone per nudge kind. */
const KIND_STYLE: Record<PendingNudge['kind'], { icon: IconName; tone: Tone }> = {
  break: { icon: 'paw', tone: 'pet' },
  meal: { icon: 'bowl', tone: 'food' },
  medication: { icon: 'pill', tone: 'med' },
};

/** Groups nudges by pet, preserving the urgency order of each pet's first nudge. */
function groupByPet(nudges: PendingNudge[]): { petId: string; petName: string; items: PendingNudge[] }[] {
  const groups: { petId: string; petName: string; items: PendingNudge[] }[] = [];
  for (const n of nudges) {
    let g = groups.find((x) => x.petId === n.petId);
    if (!g) {
      g = { petId: n.petId, petName: n.petName, items: [] };
      groups.push(g);
    }
    g.items.push(n);
  }
  return groups;
}

function NudgeCard({
  nudge,
  now,
  onYes,
  onNotYet,
  onSnooze,
}: {
  nudge: PendingNudge;
  now: Date;
  onYes: (n: PendingNudge) => void;
  onNotYet: (n: PendingNudge) => void;
  onSnooze: (n: PendingNudge) => void;
}) {
  const s = KIND_STYLE[nudge.kind];
  const late = nudge.overdueBy >= 60 * 1000;
  const lateText = nudgeLateness(nudge.overdueBy);
  return (
    <Card padded style={styles.nudgeCard}>
      <View style={styles.nudgeTop}>
        <IconTile icon={s.icon} tone={late ? 'attention' : s.tone} size={44} />
        <View style={styles.nudgeText}>
          <Text style={styles.nudgeTitle}>{nudge.title}</Text>
          <Text style={styles.nudgeSub}>
            {late ? `${nudge.subtitle} · due ${friendlyAgo(now.getTime() - nudge.overdueBy, now)}` : nudge.subtitle}
          </Text>
        </View>
        <Pill
          tone={late ? 'attention' : 'pet'}
          icon="clock"
          label={lateText.charAt(0).toUpperCase() + lateText.slice(1)}
        />
      </View>
      <NudgeActionButtons nudge={nudge} onYes={onYes} onNotYet={onNotYet} onSnooze={onSnooze} />
    </Card>
  );
}

/**
 * Notification Center — two lists:
 *   (a) "Needs your answer": currently-due nudges derived from PREDICTION data (petSchedule),
 *       grouped by pet and answerable with the same shared Yes / Not yet / Snooze actions the push
 *       handler uses. This is the always-available surface (works on web and without permission).
 *   (b) "Coming up": the OS's already-scheduled notifications (native only, guarded via `safe`).
 *       On web / without permission this section is simply empty and (a) stands alone.
 */
export default function NotificationsScreen() {
  const { pets } = usePets();
  const { logs } = useLogs();
  const { items: feedTimes } = usePersistedCollection(repos.feedTimes);
  const { items: medications } = usePersistedCollection(repos.medications);
  const now = useNow();

  const { nudges, onYes, onNotYet, onSnooze } = usePendingNudges(
    pets,
    feedTimes,
    medications,
    logs,
    now,
  );

  // Scheduled OS notifications (native only; [] on web). Refresh on mount, on foreground, and as
  // time ticks so a just-answered/re-armed reminder shows up.
  const [scheduled, setScheduled] = useState<ScheduledSummary[]>([]);
  useEffect(() => {
    let live = true;
    const pull = () => {
      listScheduledSummaries().then((s) => {
        if (live) setScheduled(s);
      });
    };
    pull();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') pull();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [now]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const hasContent = nudges.length > 0 || scheduled.length > 0;
  const petNames = joinNames(pets.map((p) => p.name));
  const groups = groupByPet(nudges);

  const header = (
    <ScreenHeader
      title="Notifications"
      subtitle={
        nudges.length > 0
          ? `${nudges.length} ${nudges.length === 1 ? 'thing needs' : 'things need'} a quick answer`
          : pets.length > 0
            ? `Reminders for ${petNames}`
            : undefined
      }
      backIcon="close"
      backLabel="Close notifications"
      onBack={close}
    />
  );

  if (!hasContent) {
    return (
      <Screen header={header} scroll={false} edges={['top', 'bottom']}>
        <PetEmptyState
          icon="bell"
          tone="pet"
          title="You're all caught up"
          body={
            pets.length > 0
              ? `Nothing needs you right now. Reminders for ${petNames}'s potty breaks, meals and visits will show up here.`
              : 'Reminders for potty breaks, meals and visits will show up here.'
          }
          action={{ label: 'Back to today', icon: 'home', onPress: close }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} edges={['top', 'bottom']}>
      {groups.length > 0 && (
        <View style={styles.section}>
          <SectionLabel hint="Answer here and we'll update the next reminder.">Needs your answer</SectionLabel>
          {groups.map((g) => {
            const pet = pets.find((p) => p.id === g.petId);
            return (
              <View key={g.petId} style={styles.group}>
                <View style={styles.groupHeader}>
                  {pet ? <PetAvatar pet={pet} size={36} emojiSize={20} ring /> : null}
                  <Text style={styles.groupName}>{g.petName}</Text>
                  <Pill tone="neutral" size="sm" label={`${g.items.length}`} />
                </View>
                {g.items.map((nudge) => (
                  <NudgeCard
                    key={nudge.key}
                    nudge={nudge}
                    now={now}
                    onYes={onYes}
                    onNotYet={onNotYet}
                    onSnooze={onSnooze}
                  />
                ))}
              </View>
            );
          })}
        </View>
      )}

      {scheduled.length > 0 && (
        <View style={styles.section}>
          <SectionLabel>Coming up</SectionLabel>
          <Card>
            {scheduled.map((s, i) => (
              <ListRow
                key={s.id}
                icon="bell"
                tone="pet"
                title={s.title}
                subtitle={s.body || undefined}
                right={
                  <View style={styles.when}>
                    <Text style={styles.whenText}>{whenLabel(s.fireAt, now)}</Text>
                    <Text style={styles.whenSub}>{friendlyIn(s.fireAt, now)}</Text>
                  </View>
                }
                divider={i < scheduled.length - 1}
              />
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.lg },
  group: { marginBottom: space.lg },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  groupName: { ...type.subhead, color: ink.primary },
  nudgeCard: { marginBottom: space.sm },
  nudgeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
  nudgeText: { flex: 1, minWidth: 0 },
  nudgeTitle: { ...type.subhead, fontSize: 16.5, color: ink.primary },
  nudgeSub: { ...type.bodySm, color: ink.muted, marginTop: 2 },
  when: { alignItems: 'flex-end' },
  whenText: { ...type.caption, fontSize: 13.5, color: ink.primary },
  whenSub: { ...type.caption, color: ink.muted, marginTop: 1 },
});
