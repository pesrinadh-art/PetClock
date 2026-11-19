import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, glass, ink, radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';
import { SectionLabel } from '../ui';
import type { CareModuleId } from '../../lib/db/models';
import type { GoalOption } from './goals';

/**
 * The PetWizard "Goals" step: "What do you want help with?" — one glass row per offered care
 * module, accent-soft with an accent outline when ticked. The options, their wording and the
 * at-least-one rule come from ./goals; this component only draws them.
 */
export function GoalsStep({
  petName,
  options,
  selected,
  onToggle,
}: {
  petName: string;
  options: GoalOption[];
  selected: readonly CareModuleId[];
  onToggle: (id: CareModuleId) => void;
}) {
  const onlyOneLeft = selected.length <= 1;
  return (
    <>
      <SectionLabel sub={`Pick what you'd like reminders for with ${petName}. You can change this later.`}>
        What do you want help with?
      </SectionLabel>
      <View style={styles.list} role="list">
        {options.map((opt) => {
          const on = selected.includes(opt.id);
          const locked = on && onlyOneLeft;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onToggle(opt.id)}
              role="checkbox"
              aria-checked={on}
              aria-label={opt.title}
              aria-disabled={locked}
              style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
            >
              <View style={styles.iconTile}>
                <Icon name={opt.icon} size={18} color={on ? accent.ink : ink.muted} strokeWidth={1.8} />
              </View>
              <View style={styles.text}>
                <Text style={[styles.title, on && styles.titleOn]}>{opt.title}</Text>
                <Text style={styles.description}>{opt.description}</Text>
              </View>
              <View style={[styles.check, on && styles.checkOn]}>
                {on && <Icon name="check" size={13} color={accent.onAccent} strokeWidth={2.4} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      {selected.length === 1 ? (
        <Text style={styles.hint}>Keep at least one selected.</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fill,
  },
  rowOn: { backgroundColor: accent.soft, borderColor: accent.line },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: radius.iconTile,
    backgroundColor: glass.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { fontSize: 15, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.25 },
  titleOn: { color: accent.ink },
  description: { fontSize: 12.5, fontFamily: fonts.regular, color: ink.muted, marginTop: 2, lineHeight: 17 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: glass.border2,
    backgroundColor: glass.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: accent.primary, borderColor: accent.primary },
  hint: { fontSize: 12, fontFamily: fonts.regular, color: ink.muted, marginTop: 10, marginLeft: 2 },
});
