import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius } from '../theme/colors';
import { fonts } from '../theme/fonts';

/**
 * Shown when there are no pets yet (D27) — screens that need an active pet render this
 * instead of crashing on a null `activePet`.
 */
export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => router.push('/add-pet')}
        accessibilityRole="button"
        accessibilityLabel="Add your first pet"
      >
        <Text style={styles.btnText}>➕ Add Your First Pet</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  icon: { fontSize: 44, marginBottom: 4 },
  title: { fontSize: 18, fontFamily: fonts.extraBold, color: colors.stone },
  body: { fontSize: 13, color: colors.stoneMid, textAlign: 'center', lineHeight: 19, marginBottom: 14 },
  btn: { backgroundColor: colors.sage, borderRadius: radius.lg, paddingVertical: 13, paddingHorizontal: 24 },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnText: { color: colors.white, fontSize: 14, fontFamily: fonts.extraBold },
});
