import { router, Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text
        style={{
          fontSize: 10,
          fontFamily: fonts.bold,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: focused ? colors.sage : colors.stoneLight,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: colors.cream,
            borderTopWidth: 1,
            borderTopColor: colors.stoneLight,
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
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} /> }}
        />
        <Tabs.Screen
          name="food"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🍽️" label="Food" focused={focused} /> }}
        />
        <Tabs.Screen
          name="appointments"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📅" label="Appts" focused={focused} /> }}
        />
        <Tabs.Screen
          name="pets"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🐾" label="Pets" focused={focused} /> }}
        />
      </Tabs>

      <Pressable
        onPress={() => router.push('/add-appointment')}
        style={({ pressed }) => [
          {
            position: 'absolute',
            bottom: 30 + insets.bottom,
            left: '50%',
            marginLeft: -25,
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: colors.sage,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.sage,
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          },
          pressed && { transform: [{ scale: 0.92 }], backgroundColor: colors.sageLight },
        ]}
      >
        <Text style={{ color: colors.white, fontSize: 26, fontFamily: fonts.bold, marginTop: -2 }}>+</Text>
      </Pressable>
    </View>
  );
}
