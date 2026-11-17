import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ink, line, radius, surface, terracotta } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from './Icon';

/**
 * Dashed empty-state card (redesign v3): a tinted icon circle, a bold title, a muted body and
 * a soft tinted action button — "No meal times for Mochi yet · Set meal times".
 */
export function EmptyActionCard({
  title,
  body,
  actionLabel,
  onAction,
  icon = 'bowl',
  actionIcon = 'plus',
  tint = terracotta.tint,
  ink: accent = terracotta.primary,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  icon?: IconName;
  actionIcon?: IconName;
  tint?: string;
  ink?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Icon name={icon} size={20} color={accent} strokeWidth={2} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: tint }, pressed && styles.pressed]}
        onPress={onAction}
        role="button"
        aria-label={actionLabel}
      >
        <Icon name={actionIcon} size={17} color={accent} strokeWidth={2.3} />
        <Text style={[styles.btnText, { color: accent }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: line.dashed,
    backgroundColor: surface.card,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 15, fontFamily: fonts.bold, color: ink.primary, textAlign: 'center' },
  body: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: ink.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.tile,
  },
  btnText: { fontSize: 14, fontFamily: fonts.bold },
  pressed: { opacity: 0.75 },
});
