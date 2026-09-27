import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, line, radius, space, surface, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { Icon, type IconName } from '../Icon';
import { PetAvatar } from '../PetAvatar';
import { Button } from './Button';

type Action = { label: string; onPress: () => void; icon?: IconName };

/**
 * Meaningful empty state: always tells the owner WHAT TO DO NEXT.
 *
 * Two layouts:
 *  - `variant="screen"` (default): centred, fills the available space - for a
 *    whole screen with nothing yet (no pets, no visits).
 *  - `variant="card"`: a soft dashed card inline in a section - for an empty
 *    list inside a populated screen ("No meds for Mochi yet").
 *
 * Visual is the pet's avatar when `pet` is passed (personal!), else a tinted
 * icon. Title/body should name the pet:
 *
 *   <PetEmptyState
 *     pet={pet}
 *     title="No visits planned for Mochi"
 *     body="Add a vet check-up or grooming and we'll remind you the day before."
 *     action={{ label: 'Plan a visit', icon: 'plus', onPress: goAdd }}
 *   />
 *
 *   <PetEmptyState variant="card" icon="pill" tone="med"
 *     title="No medications" body="Add one and we'll nudge you when it's due."
 *     action={{ label: 'Add medication', onPress: ... }} />
 */
export function PetEmptyState({
  title,
  body,
  icon = 'paw',
  tone = 'pet',
  pet,
  action,
  secondaryAction,
  variant = 'screen',
  style,
}: {
  title: string;
  body?: string;
  icon?: IconName;
  tone?: Tone;
  pet?: { id: string; avatarEmoji: string; name?: string } | null;
  action?: Action;
  secondaryAction?: Action;
  variant?: 'screen' | 'card';
  style?: ViewStyle;
}) {
  const t = tones[tone];
  const isCard = variant === 'card';
  return (
    <View style={[isCard ? styles.card : styles.screen, style]}>
      {pet ? (
        <PetAvatar pet={pet} size={isCard ? 52 : 84} ring />
      ) : (
        <View
          style={[
            styles.bubble,
            { backgroundColor: t.bg },
            isCard ? { width: 52, height: 52, borderRadius: 26 } : { width: 88, height: 88, borderRadius: 44 },
          ]}
        >
          <Icon name={icon} size={isCard ? 24 : 38} color={t.ink} strokeWidth={2} />
        </View>
      )}
      <Text style={[styles.title, isCard && styles.titleCard]} role="heading">
        {title}
      </Text>
      {!!body && <Text style={[styles.body, isCard && styles.bodyCard]}>{body}</Text>}
      {(action || secondaryAction) && (
        <View style={[styles.actions, isCard && styles.actionsCard]}>
          {action ? (
            <Button
              label={action.label}
              icon={action.icon}
              onPress={action.onPress}
              tone={tone === 'neutral' ? 'pet' : tone}
              size={isCard ? 'md' : 'lg'}
              variant={isCard ? 'soft' : 'primary'}
              fullWidth={!isCard}
              style={isCard ? styles.cardBtn : undefined}
            />
          ) : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              icon={secondaryAction.icon}
              onPress={secondaryAction.onPress}
              variant="ghost"
              size="md"
              fullWidth={!isCard}
              style={isCard ? styles.cardBtn : undefined}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.xxl,
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
    backgroundColor: surface.card,
  },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: ink.primary, textAlign: 'center', marginTop: space.lg },
  titleCard: { ...type.subhead, marginTop: space.sm },
  body: { ...type.body, color: ink.muted, textAlign: 'center', marginTop: space.xs, maxWidth: 300 },
  bodyCard: { ...type.bodySm, marginTop: 4 },
  actions: { alignSelf: 'stretch', marginTop: space.xl, gap: space.xs },
  actionsCard: { alignSelf: 'center', marginTop: space.md, alignItems: 'center' },
  cardBtn: { alignSelf: 'center' },
});

export default PetEmptyState;
