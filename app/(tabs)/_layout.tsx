import { router, Tabs, useSegments } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { green, ink, line, shadow, surface } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';
import { tapFeedback } from '../../components/ui/haptics';

const ACTIVE = green.primary;
const INACTIVE = ink.muted; // AA on the bar (was #a9a193, ~2.4:1)

// Tab bar geometry. 72px content height gives each tab a >= 56px tap area;
// the centre gap leaves room for the lifted FAB so it never overlaps a label.
const BAR_HEIGHT = 72;
const FAB_SIZE = 60;
const FAB_GAP = 36; // extra space either side of the FAB (applied as tab item margins)

/**
 * One tab: icon inside a soft pill that fills green-tint when focused, with a
 * sentence-case label underneath. Selection is shown by colour AND the pill
 * AND a heavier label weight (never colour alone).
 */
function TabIcon({ name, label, focused }: { name: IconName; label: string; focused: boolean }) {
  const color = focused ? ACTIVE : INACTIVE;
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconPill, focused && styles.iconPillActive]}>
        <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.3 : 2} />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, { color, fontFamily: focused ? fonts.extraBold : fonts.semiBold }]}
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
  const fabLabel = fabTarget === '/add-pet' ? 'Add pet' : 'Add appointment';

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarStyle: {
            backgroundColor: surface.tabBar,
            borderTopWidth: 1,
            borderTopColor: line.border,
            height: BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 6,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarItemStyle: { height: BAR_HEIGHT - 6, justifyContent: 'center' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Today',
            tabBarAccessibilityLabel: 'Today',
            tabBarIcon: ({ focused }) => <TabIcon name="home" label="Today" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: 'Family',
            tabBarAccessibilityLabel: 'Family and sharing',
            tabBarItemStyle: { height: BAR_HEIGHT - 6, justifyContent: 'center', marginRight: FAB_GAP },
            tabBarIcon: ({ focused }) => <TabIcon name="users" label="Family" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Visits',
            tabBarAccessibilityLabel: 'Vet and care visits',
            tabBarItemStyle: { height: BAR_HEIGHT - 6, justifyContent: 'center', marginLeft: FAB_GAP },
            tabBarIcon: ({ focused }) => <TabIcon name="calendar" label="Visits" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="pets"
          options={{
            title: 'Pets',
            tabBarAccessibilityLabel: 'Your pets',
            tabBarIcon: ({ focused }) => <TabIcon name="paw" label="Pets" focused={focused} />,
          }}
        />
        {/* Food tab retired in the redesign — meal UI moves into the pet profile.
            The route file stays for now (its logic is reused) but is hidden from
            the bar. TODO redesign: meal UI moved to pet profile. */}
        <Tabs.Screen name="food" options={{ href: null }} />
      </Tabs>

      {/* Centre green FAB — 60px circle lifted above the bar with a bar-coloured
          ring. Sits in the gap reserved by the Family/Visits item margins. */}
      <Pressable
        onPress={() => {
          tapFeedback();
          router.push(fabTarget);
        }}
        role="button"
        aria-label={fabLabel}
        hitSlop={6}
        style={({ pressed }) => [
          styles.fab,
          { bottom: BAR_HEIGHT - FAB_SIZE / 2 - 4 + insets.bottom },
          pressed && { transform: [{ scale: 0.92 }], backgroundColor: green.primary },
        ]}
      >
        <Icon name="plus" size={26} color={ink.onDark} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 3, width: 76 },
  iconPill: {
    width: 52,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: green.tint },
  tabLabel: {
    fontSize: 12,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -FAB_SIZE / 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: green.mid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: surface.tabBar,
    ...shadow.fab,
  },
});
