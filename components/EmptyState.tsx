import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accent, glass, ink, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/**
 * Shown when there are no pets yet (D27) — screens that need an active pet render this
 * instead of crashing on a null `activePet`. Design v2: the caller's glyph in a round
 * accent-soft tile, a weight-500 title, muted body and a violet primary pill.
 */
export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconTile}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title} role="heading">{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => router.push('/add-pet')}
        role="button"
        aria-label="Add your first pet"
      >
        <Icon name="plus" size={17} color={accent.onAccent} strokeWidth={2} />
        <Text style={styles.btnText}>Add your first pet</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: accent.soft,
    borderWidth: 1,
    borderColor: accent.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  icon: { fontSize: 32 },
  title: { fontSize: 20, fontFamily: fonts.medium, color: ink.primary, letterSpacing: -0.6, textAlign: 'center' },
  body: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: ink.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: accent.primary,
    borderWidth: 1,
    borderColor: glass.border,
    ...shadow.fab,
    shadowOpacity: 0.3,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  btnText: { color: accent.onAccent, fontSize: 14, fontFamily: fonts.medium },
});
