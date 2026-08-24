import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { category, ink, line, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from './Icon';
import type { ApptType } from '../data/mockData';

export type ApptFilter = 'all' | ApptType;

// Filter chips mirror screen_2c: a dark "All" pill, then a colour-coded chip per
// type carrying its category <Icon>. Colours come from the shared role tokens.
const TABS: { key: ApptFilter; label: string; icon?: IconName; ink: string }[] = [
  { key: 'all', label: 'All', ink: ink.primary },
  { key: 'vet', label: 'Vet', icon: 'vet', ink: category.vetInk },
  { key: 'vaccine', label: 'Vaccine', icon: 'vaccine', ink: category.vaccineInk },
  { key: 'groom', label: 'Groom', icon: 'scissors', ink: category.groomInk },
];

export function ApptTabs({ value, onChange }: { value: ApptFilter; onChange: (v: ApptFilter) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {TABS.map((t) => {
        const selected = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            role="tab"
            aria-label={`${t.label} appointments`}
            aria-selected={selected}
            style={({ pressed }) => [
              styles.tab,
              t.icon ? styles.tabWithIcon : null,
              selected
                ? { backgroundColor: t.ink, borderColor: t.ink }
                : { backgroundColor: surface.card, borderColor: line.border },
              pressed && styles.pressed,
            ]}
          >
            {t.icon && (
              <Icon name={t.icon} size={13} color={selected ? ink.onDark : t.ink} strokeWidth={2} />
            )}
            <Text
              style={[
                styles.label,
                { color: selected ? ink.onDark : t.key === 'all' ? ink.primary : '#5d564c' },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 7, paddingVertical: 2, paddingRight: 4 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabWithIcon: { gap: 5, paddingHorizontal: 13 },
  label: { fontSize: 12, fontFamily: fonts.bold },
  pressed: { opacity: 0.7 },
});
