import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, glass, ink, radius, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon, type IconName } from './Icon';

/**
 * Empty-state glass card (design v2 `.card.glass`, dashed hairline): an accent-soft icon
 * tile, a weight-500 title, a muted body and a soft accent action pill —
 * "No meal times for Mochi yet · Set meal times". `tint` / `ink` still override the
 * tile + action colours for older call sites.
 */
export function EmptyActionCard({
  title,
  body,
  actionLabel,
  onAction,
  icon = 'bowl',
  actionIcon = 'plus',
  tint = accent.soft,
  ink: tone = accent.ink,
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
        <Icon name={icon} size={18} color={tone} strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: tint }, pressed && styles.pressed]}
        onPress={onAction}
        role="button"
        aria-label={actionLabel}
      >
        <Icon name={actionIcon} size={16} color={tone} strokeWidth={2} />
        <Text style={[styles.btnText, { color: tone }]}>{actionLabel}</Text>
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
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: glass.border2,
    backgroundColor: surface.card,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: ink.primary,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    fontFamily: fonts.regular,
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
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: accent.line,
  },
  btnText: { fontSize: 13.5, fontFamily: fonts.medium },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
