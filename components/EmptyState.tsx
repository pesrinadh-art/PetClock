import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { green, ink, space } from '../theme/colors';
import { type } from '../theme/fonts';
import { Button } from './ui/Button';
import type { IconName } from './Icon';

/**
 * Shown when there are no pets yet (D27) - screens that need an active pet render this
 * instead of crashing on a null `activePet`.
 *
 * Back-compat: `{ icon, title, body }` still renders the "add your first pet" CTA that
 * pushes /add-pet. Pet-owner redesign: the CTA copy and target are overridable, and an
 * optional secondary action can be shown. For NEW empty states prefer
 * `PetEmptyState` from components/ui (takes a pet avatar + IconName).
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel = 'Add your first pet',
  actionIcon = 'plus',
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  /** An emoji shown in a soft green bubble (e.g. "🐾"). */
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionIcon?: IconName;
  /** Defaults to router.push('/add-pet') - the original behaviour. */
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bubble}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title} role="heading">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        <Button
          label={actionLabel}
          icon={actionIcon}
          fullWidth
          onPress={onAction ?? (() => router.push('/add-pet'))}
        />
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} variant="ghost" size="md" fullWidth onPress={onSecondary} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, paddingBottom: 60 },
  bubble: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: green.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  icon: { fontSize: 50 },
  title: { ...type.title, color: ink.primary, textAlign: 'center' },
  body: { ...type.body, color: ink.muted, textAlign: 'center', marginTop: space.xs, maxWidth: 300 },
  actions: { alignSelf: 'stretch', marginTop: space.xl, gap: space.xs },
});
