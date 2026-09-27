import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { surface, ink, radius, shadow, space, terracotta, tap } from '../theme/colors';
import { type } from '../theme/fonts';
import { Icon } from './Icon';
import { PetAvatar } from './PetAvatar';
import { IconButton, Pill } from './ui';
import { useNow } from '../hooks/useNow';
import { isBirthday, petMeta } from '../lib/petVoice';
import type { Pet } from '../data/mockData';

/**
 * A pet row on the Pets list: a big white card with the pet's ringed photo,
 * their name and a friendly meta line. The whole main area opens the pet
 * profile (where meals, meds and records live); the trailing control is a quiet
 * remove affordance that asks for confirmation on the Pets screen.
 */
export function PetListItem({
  pet,
  onDelete,
}: {
  pet: Pet;
  onDelete?: () => void;
}) {
  const now = useNow(60_000);
  const birthday = isBirthday(pet.birthdate, now);
  const meta = petMeta(pet, now);

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
        onPress={() => router.push({ pathname: '/pet/[id]', params: { id: pet.id } })}
        role="button"
        aria-label={`Open ${pet.name}'s profile`}
      >
        <PetAvatar
          pet={pet}
          size={56}
          ring
          badge={birthday ? <Icon name="cake" size={12} color={terracotta.primary} strokeWidth={2.2} /> : undefined}
        />
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.name}>
            {pet.name}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {meta}
          </Text>
          {birthday ? (
            <Pill tone="food" icon="cake" label="Birthday today" size="sm" style={styles.pill} />
          ) : (
            <Text numberOfLines={1} style={styles.hint}>
              Meals, meds and care diary
            </Text>
          )}
        </View>
        <Icon name="chevronRight" size={18} color={ink.placeholder} strokeWidth={2.3} />
      </Pressable>
      {onDelete && (
        <IconButton
          icon="trash"
          variant="plain"
          size={tap.min}
          onPress={onDelete}
          accessibilityLabel={`Remove ${pet.name}`}
          style={styles.remove}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    backgroundColor: surface.card,
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    marginBottom: space.sm,
    minHeight: 88,
    ...shadow.card,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1, minHeight: tap.min },
  mainPressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0 },
  name: { ...type.heading, fontSize: 18, lineHeight: 23, color: ink.primary },
  sub: { ...type.bodySm, color: ink.muted, marginTop: 2 },
  hint: { ...type.caption, color: ink.faint, marginTop: 4 },
  pill: { alignSelf: 'flex-start', marginTop: 6 },
  remove: { marginLeft: 2 },
});
