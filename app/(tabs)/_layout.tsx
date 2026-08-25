import { router, Tabs, useSegments } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { green, ink, line, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';

const ACTIVE = green.primary;
const INACTIVE = '#a9a193';

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
      <Icon name={name} size={20} color={color} />
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
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
            elevation: 0,
            shadowOpacity: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="home" label="HOME" focused={focused} /> }}
        />
        <Tabs.Screen
          name="shared"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="users" label="SHARED" focused={focused} /> }}
        />
        <Tabs.Screen
          name="appointments"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="calendar" label="APPTS" focused={focused} /> }}
        />
        <Tabs.Screen
          name="pets"
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="paw" label="PETS" focused={focused} /> }}
        />
        {/* Food tab retired in the redesign — meal UI moves into the pet profile.
            The route file stays for now (its logic is reused) but is hidden from
            the bar. TODO redesign: meal UI moved to pet profile. */}
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
          { bottom: 34 + insets.bottom },
          pressed && { transform: [{ scale: 0.92 }], backgroundColor: green.primary },
        ]}
      >
        <Icon name="plus" size={22} color={ink.onDark} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 4, width: 72 },
  tabLabel: {
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -27,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: green.mid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: surface.tabBar,
    ...shadow.fab,
  },
});
