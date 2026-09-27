import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ink, radius, shadow, space, surface, tones, type Tone } from '../theme/colors';
import { type } from '../theme/fonts';
import type { Reminder } from '../data/mockData';
import { IconTile } from './ui';
import type { IconName } from './Icon';

const STYLE: Record<Reminder['type'], { icon: IconName; tone: Tone }> = {
  pee: { icon: 'drop', tone: 'pee' },
  poo: { icon: 'poo', tone: 'poo' },
  food: { icon: 'bowl', tone: 'food' },
  appt: { icon: 'vet', tone: 'vet' },
  medication: { icon: 'pill', tone: 'med' },
};

/**
 * Legacy horizontal strip of reminder cards (not rendered by the current Home,
 * which lists "Coming up for <pet>" vertically). Restyled to the pet-owner
 * tokens: drawn icon tiles by role, sentence-case labels, text >= 12px.
 */
export function RemindersStrip({ reminders }: { reminders: Reminder[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {reminders.map((r) => {
        const s = STYLE[r.type];
        return (
          <View key={r.id} style={[styles.card, { borderTopColor: tones[s.tone].solid }]}>
            <IconTile icon={s.icon} tone={s.tone} size={36} style={styles.tile} />
            <Text numberOfLines={1} style={styles.type}>{r.label}</Text>
            <Text numberOfLines={1} style={styles.time}>{r.time}</Text>
            <Text numberOfLines={1} style={styles.sub}>{r.sub}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 10, paddingVertical: 6, paddingRight: 4 },
  card: {
    minWidth: 150,
    maxWidth: 220,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    padding: space.md,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    ...shadow.card,
  },
  tile: { marginBottom: space.xs },
  type: { ...type.subhead, color: ink.primary },
  time: { ...type.bodySm, fontFamily: type.subhead.fontFamily, color: ink.primary, marginTop: 2 },
  sub: { ...type.caption, color: ink.muted, marginTop: 1 },
});
