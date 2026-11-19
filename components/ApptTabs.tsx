import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { glass, ink, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';
import type { ApptType } from '../data/mockData';
import { VISIT_META } from '../lib/visits';

export type ApptFilter = 'all' | ApptType;

const ORDER: ApptType[] = ['vet', 'vaccine', 'groom', 'other'];

/**
 * Visit filter chips (design v2 `.chips` / `.chip`): "All 3" then one chip per visit type that
 * has any visits ("Vet 1", "Vaccines 1"), each with its line icon and a mono count. The selected
 * chip is an ink-filled pill with light text; the rest are hairline glass pills.
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
  const tabs: { key: ApptFilter; name: string; count: number; label: string }[] = [
    { key: 'all', name: 'All', count: counts.all, label: `All · ${counts.all}` },
    ...ORDER.filter((t) => counts[t] > 0 || value === t).map((t) => ({
      key: t as ApptFilter,
      name: VISIT_META[t].plural,
      count: counts[t],
      label: `${VISIT_META[t].plural} · ${counts[t]}`,
    })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
      {tabs.map((t) => {
        const selected = value === t.key;
        const icon = t.key === 'all' ? 'calendar' : VISIT_META[t.key].icon;
        const color = selected ? ink.onDark : ink.primary;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            role="tab"
            aria-label={`${t.label} visits`}
            aria-selected={selected}
            style={({ pressed }) => [styles.tab, selected ? styles.tabOn : styles.tabOff, pressed && styles.pressed]}
          >
            <Icon name={icon} size={15} color={color} strokeWidth={1.8} />
            <Text style={[styles.label, { color }]}>{t.name}</Text>
            <Text style={[styles.count, { color }]}>{t.count}</Text>
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
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tabOn: { backgroundColor: ink.primary, borderColor: 'transparent' },
  tabOff: { backgroundColor: glass.fill, borderColor: glass.border },
  label: { fontSize: 13, fontFamily: fonts.medium },
  count: { fontSize: 11, fontFamily: fonts.mono, opacity: 0.65 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
