import { ScrollView, StyleSheet, Text } from 'react-native';
import { Pressable } from 'react-native';
import { green, ink, line, surface, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import type { ApptType } from '../data/mockData';
import { VISIT_META } from '../lib/visits';

export type ApptFilter = 'all' | ApptType;

const ORDER: ApptType[] = ['vet', 'vaccine', 'groom', 'other'];

/**
 * Visit filter chips (redesign v3): "All · 3 ✓" then one chip per visit type that has any
 * visits ("Vet · 1", "Vaccines · 1"), each with its drawn icon. The selected chip is a green
 * tint pill with a check.
 */
export function ApptTabs({
  value,
  onChange,
  counts,
}: {
  value: ApptFilter;
  onChange: (v: ApptFilter) => void;
  counts: Record<ApptFilter, number>;
}) {
  const tabs: { key: ApptFilter; label: string }[] = [
    { key: 'all', label: `All · ${counts.all}` },
    ...ORDER.filter((t) => counts[t] > 0 || value === t).map((t) => ({
      key: t as ApptFilter,
      label: `${VISIT_META[t].plural} · ${counts[t]}`,
    })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
      {tabs.map((t) => {
        const selected = value === t.key;
        const icon = t.key === 'all' ? 'calendar' : VISIT_META[t.key].icon;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            role="tab"
            aria-label={`${t.label} visits`}
            aria-selected={selected}
            style={({ pressed }) => [styles.tab, selected ? styles.tabOn : styles.tabOff, pressed && styles.pressed]}
          >
            <Icon name={icon} size={16} color={selected ? green.primary : ink.primary} strokeWidth={2} />
            <Text style={[styles.label, selected && styles.labelOn]}>{t.label}</Text>
            {selected && <Icon name="check" size={15} color={green.primary} strokeWidth={2.6} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 8, paddingVertical: 3, paddingHorizontal: 20 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  tabOn: { backgroundColor: green.tint, borderColor: green.mid },
  tabOff: { backgroundColor: surface.card, borderColor: line.border, ...shadow.sm },
  label: { fontSize: 14, fontFamily: fonts.bold, color: ink.primary },
  labelOn: { color: green.primary },
  pressed: { opacity: 0.7 },
});
