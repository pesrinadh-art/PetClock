import { ScrollView, StyleSheet } from 'react-native';
import { space } from '../theme/colors';
import { ChoiceChip } from './ui';
import type { IconName } from './Icon';
import type { Tone } from '../theme/colors';
import type { ApptType } from '../data/mockData';
import { APPT_TYPE_META } from './appointments/apptMeta';

export type ApptFilter = 'all' | ApptType;

// Filter chips: 48px ChoiceChips, tinted by visit type. Selection shows as
// tint + border + check (never colour alone). Optional counts help owners see
// at a glance what is planned in each group.
const TABS: { key: ApptFilter; label: string; icon: IconName; tone: Tone }[] = [
  { key: 'all', label: 'All', icon: 'calendar', tone: 'pet' },
  { key: 'vet', label: APPT_TYPE_META.vet.short, icon: APPT_TYPE_META.vet.icon, tone: APPT_TYPE_META.vet.tone },
  {
    key: 'vaccine',
    label: 'Vaccines',
    icon: APPT_TYPE_META.vaccine.icon,
    tone: APPT_TYPE_META.vaccine.tone,
  },
  { key: 'groom', label: APPT_TYPE_META.groom.short, icon: APPT_TYPE_META.groom.icon, tone: APPT_TYPE_META.groom.tone },
  { key: 'other', label: APPT_TYPE_META.other.short, icon: APPT_TYPE_META.other.icon, tone: APPT_TYPE_META.other.tone },
];

export function ApptTabs({
  value,
  onChange,
  counts,
}: {
  value: ApptFilter;
  onChange: (v: ApptFilter) => void;
  /** Optional number of visits per filter, shown after the label. */
  counts?: Partial<Record<ApptFilter, number>>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {TABS.map((t) => {
        const n = counts?.[t.key];
        return (
          <ChoiceChip
            key={t.key}
            label={n != null ? `${t.label} · ${n}` : t.label}
            icon={t.icon}
            tone={t.tone}
            selected={value === t.key}
            onPress={() => onChange(t.key)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: space.xs, paddingVertical: 2, paddingHorizontal: space.gutter },
});
