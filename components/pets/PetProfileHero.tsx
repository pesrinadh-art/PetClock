import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { amber, green, ink, radius, shadow, space } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';
import { Icon } from '../Icon';
import { PetAvatar } from '../PetAvatar';
import { StatGroup, type Stat } from '../ui';

type HeroPet = { id: string; avatarEmoji: string; name: string };

/**
 * Photo-forward profile hero for a single pet: the green gradient card with a big
 * ringed avatar centred at the top, the pet's name large, a meta line
 * ("Shiba Inu · 3 yrs"), an optional tag row, and the stat row underneath.
 */
export function PetProfileHero({
  pet,
  meta,
  stats,
  birthday = false,
  tags,
}: {
  pet: HeroPet;
  meta: string;
  stats: Stat[];
  birthday?: boolean;
  /** Short friendly facts shown as light chips under the name. */
  tags?: string[];
}) {
  return (
    <View style={styles.shadowWrap}>
      <LinearGradient
        colors={[green.gradientFrom, green.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.watermark} pointerEvents="none">
          <Icon name="paw" size={150} color="rgba(255,255,255,0.07)" filled />
        </View>

        <PetAvatar
          pet={pet}
          size={104}
          ring="onDark"
          badge={
            birthday ? (
              <View style={styles.badge}>
                <Icon name="cake" size={14} color={green.primary} strokeWidth={2.2} />
              </View>
            ) : undefined
          }
        />
        <Text style={styles.name} numberOfLines={1} role="heading">
          {pet.name}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {meta}
        </Text>

        {tags && tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.divider} />
        <StatGroup stats={stats} variant="onDark" style={styles.stats} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: { borderRadius: radius.hero, ...shadow.hero },
  card: {
    borderRadius: radius.hero,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  watermark: { position: 'absolute', right: -34, bottom: -40, transform: [{ rotate: '-18deg' }] },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: amber.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  name: { ...type.display, color: ink.onDark, marginTop: space.md, textAlign: 'center' },
  meta: { ...type.body, fontFamily: fonts.semiBold, color: ink.onDarkMuted, marginTop: 4, textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.xs, marginTop: space.sm },
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tagText: { ...type.caption, color: ink.onDark },
  divider: { alignSelf: 'stretch', height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: space.lg },
  stats: { alignSelf: 'stretch', marginTop: space.md },
});

export default PetProfileHero;
