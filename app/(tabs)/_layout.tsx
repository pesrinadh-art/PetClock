import { useEffect, useState, type ComponentProps } from 'react';
import { router, Tabs, useSegments } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accent, glass, ink, shadow } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon, type IconName } from '../../components/Icon';
import { GlassSurface } from '../../components/ui/GlassSurface';
import { QuickLogMenu } from '../../components/QuickLogMenu';
import { usePets } from '../../context/PetsContext';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Bar items in order; the + Log button sits between Family and Visits. */
const ITEMS: { route: string; label: string; icon: IconName }[] = [
  { route: 'index', label: 'Today', icon: 'home' },
  { route: 'shared', label: 'Family', icon: 'users' },
  { route: 'appointments', label: 'Visits', icon: 'calendar' },
  { route: 'pets', label: 'Pets', icon: 'paw' },
];

const BAR_HEIGHT = 62;
const BAR_GAP = 12; // space between the bar and the bottom safe-area edge
const TIP_KEY = 'pawclock.quickLogTipSeen';

/**
 * Floating glass tab bar (design v2): Today · Family · [+ Log] · Visits · Pets.
 * Rendered absolutely so screens scroll underneath it — scroll views add
 * `TAB_BAR_CLEARANCE` bottom padding (components/ui/Screen).
 */
function GlassTabBar({
  state,
  navigation,
  onLog,
  bottom,
}: TabBarProps & { onLog: () => void; bottom: number }) {
  const current = state.routes[state.index]?.name;
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const tab = (item: (typeof ITEMS)[number]) => {
    const focused = current === item.route;
    return (
      <Pressable
        key={item.route}
        onPress={() => go(item.route)}
        role="tab"
        aria-selected={focused}
        aria-label={item.label}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
      >
        <Icon
          name={item.icon}
          size={21}
          color={focused ? accent.primary : ink.placeholder}
          strokeWidth={focused ? 2 : 1.7}
        />
        <Text style={[styles.tabLabel, { color: focused ? ink.primary : ink.muted }]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.barWrap, { bottom }]}>
      <GlassSurface intensity={50} fallbackColor="rgba(255,255,255,0.86)" style={styles.bar}>
        {tab(ITEMS[0])}
        {tab(ITEMS[1])}
        <Pressable
          onPress={onLog}
          role="button"
          aria-label="Quick log"
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Icon name="plus" size={20} color={accent.onAccent} strokeWidth={2.2} />
          <Text style={styles.fabText}>Log</Text>
        </Pressable>
        {tab(ITEMS[2])}
        {tab(ITEMS[3])}
      </GlassSurface>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { activePet } = usePets();
  const [open, setOpen] = useState(false);
  const [tipSeen, setTipSeen] = useState(true);

  const bottom = insets.bottom + BAR_GAP;
  const fabCenterBottom = bottom + BAR_HEIGHT / 2;
  const onToday = segments[segments.length - 1] === '(tabs)' || segments[segments.length - 1] === 'index';

  // One-time tip over + Log, until the menu has been opened once (or the tip dismissed).
  useEffect(() => {
    AsyncStorage.getItem(TIP_KEY)
      .then((v) => setTipSeen(v === '1'))
      .catch(() => setTipSeen(true));
  }, []);
  const dismissTip = () => {
    setTipSeen(true);
    AsyncStorage.setItem(TIP_KEY, '1').catch(() => {});
  };

  const onLog = () => {
    // No pet yet: logging has nothing to attach to, so + Log starts "add a pet".
    if (!activePet) {
      router.push('/add-pet');
      return;
    }
    if (!tipSeen) dismissTip();
    setOpen(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
        tabBar={(props) => <GlassTabBar {...props} onLog={onLog} bottom={bottom} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="shared" />
        <Tabs.Screen name="appointments" />
        <Tabs.Screen name="pets" />
        {/* "Mochi's meals" — not a bar tab: opened from the pet profile, but it lives inside
            the tab navigator so the bar stays visible (no tab highlighted). */}
        <Tabs.Screen name="food" options={{ href: null }} />
      </Tabs>

      {!tipSeen && onToday && !!activePet && !open && (
        <View pointerEvents="box-none" style={[styles.tipWrap, { bottom: bottom + BAR_HEIGHT + 12 }]}>
          <View style={styles.tip} role="note">
            <Text style={styles.tipText}>Log a break or a meal here</Text>
            <Pressable onPress={dismissTip} hitSlop={10} aria-label="Dismiss tip" style={styles.tipX}>
              <Icon name="close" size={12} color="#ffffff" strokeWidth={2.4} />
            </Pressable>
          </View>
          <View style={styles.tipArrow} />
        </View>
      )}

      <QuickLogMenu open={open} pet={activePet} fabCenterBottom={fabCenterBottom} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 16, right: 16 },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: glass.border,
    ...shadow.hero,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 52 },
  tabLabel: { fontFamily: fonts.medium, fontSize: 10.5 },
  fab: {
    height: 46,
    paddingLeft: 12,
    paddingRight: 16,
    marginHorizontal: 4,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: accent.primary,
    ...shadow.fab,
  },
  fabText: { fontFamily: fonts.medium, fontSize: 13.5, color: accent.onAccent, letterSpacing: -0.1 },

  tipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: ink.primary,
    ...shadow.hero,
  },
  tipText: { fontFamily: fonts.regular, fontSize: 12.5, color: '#ffffff' },
  tipX: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tipArrow: {
    width: 10,
    height: 10,
    marginTop: -5,
    backgroundColor: ink.primary,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
});
