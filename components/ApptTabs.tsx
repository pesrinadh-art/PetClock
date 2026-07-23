import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import type { ApptType } from '../data/mockData';

export type ApptFilter = 'all' | ApptType;

const TABS: { key: ApptFilter; label: string; accent: string; light: string }[] = [
  { key: 'all', label: 'All', accent: colors.stone, light: colors.white },
  { key: 'vet', label: '🏥 Vet', accent: colors.apptVet, light: colors.apptVetLight },
  { key: 'vaccine', label: '💉 Vaccine', accent: colors.apptVaccine, light: colors.apptVaccineLight },
  { key: 'groom', label: '✂️ Grooming', accent: colors.apptGroom, light: colors.apptGroomLight },
  { key: 'other', label: '📌 Other', accent: colors.apptOther, light: colors.apptOtherLight },
];

export function ApptTabs({ value, onChange }: { value: ApptFilter; onChange: (v: ApptFilter) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
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
              {
                backgroundColor: selected ? t.accent : t.light,
                borderColor: t.accent,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={{ fontSize: 12, fontFamily: fonts.extraBold, color: selected ? colors.white : t.accent }}>
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
  row: { gap: 8, paddingVertical: 4 },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 2 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
