import { router, Tabs, useSegments } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { green, ink, line, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';

const ACTIVE = green.primary;
const INACTIVE = ink.muted;

/** One bottom-bar item: icon over a sentence-case label; the focused tab sits on a tint pill. */
function TabIcon({
  name,
  label,
  focused,
}: {
  name: IconName;
  label: string;
  focused: boolean;
}) {
  const color = focused ? ACTIVE : INACTIVE;
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconPill, focused && styles.iconPillActive]}>
        <Icon name={name} size={21} color={color} strokeWidth={focused ? 2.1 : 1.8} />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, { color, fontFamily: focused ? fonts.bold : fonts.semiBold }]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // Context-aware FAB (D19): add a pet from the Pets tab, otherwise an appointment.
  const activeTab = segments[segments.length - 1];
  const fabTarget = activeTab === 'pets' ? '/add-pet' : '/add-appointment';

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          // Opaque #fffdf8 bar for now; screen agents can swap in <GlassSurface>
          // as the tabBarBackground once per-screen restyle begins.
          tabBarStyle: {
            backgroundColor: surface.tabBar,
            borderTopWidth: 1,
            borderTopColor: line.border,
            height: 70 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
            elevation: 0,
            shadowOpacity: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="home" label="Today" focused={focused} /> }}
        />
        <Tabs.Screen
          name="shared"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="users" label="Family" focused={focused} /> }}
        />
        <Tabs.Screen
          name="appointments"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="calendar" label="Visits" focused={focused} /> }}
        />
        <Tabs.Screen
          name="pets"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="paw" label="Pets" focused={focused} /> }}
        />
        {/* "Mochi's meals" — not a bar tab: opened from the pet profile, but it lives inside
            the tab navigator so the bar stays visible (no tab highlighted), per the design. */}
        <Tabs.Screen name="food" options={{ href: null }} />
      </Tabs>

      {/* Center green FAB — 54px circle, lifted above the bar with a 4px bar-
          coloured ring, per the mockup. */}
      <Pressable
        onPress={() => router.push(fabTarget)}
        role="button"
        aria-label={fabTarget === '/add-pet' ? 'Add pet' : 'Add appointment'}
        style={({ pressed }) => [
          styles.fab,
          { bottom: 38 + insets.bottom },
          pressed && { transform: [{ scale: 0.92 }], backgroundColor: green.primary },
        ]}
      >
        <Icon name="plus" size={26} color={ink.onDark} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 3, width: 76 },
  iconPill: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 },
  iconPillActive: { backgroundColor: green.tint },
  tabLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -31,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: green.mid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#ffffff',
    ...shadow.fab,
  },
});
