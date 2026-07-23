import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

export function TopNavBar() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        Paw<Text style={{ color: colors.pooLight }}>Clock</Text>
      </Text>
      <Pressable
        style={({ pressed }) => [styles.bell, pressed && styles.bellPressed]}
        onPress={() => router.push('/notifications')}
        role="button"
        aria-label="Notifications"
        hitSlop={8}
      >
        <Text style={{ fontSize: 16 }}>🔔</Text>
        <View style={styles.dot} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  logo: { fontSize: 22, fontFamily: fonts.black, color: colors.sage, letterSpacing: -0.5 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.pee,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellPressed: { opacity: 0.7, transform: [{ scale: 0.92 }] },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.poo,
    borderWidth: 2,
    borderColor: colors.cream,
  },
});
