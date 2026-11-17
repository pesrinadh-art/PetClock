import * as React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * The "liquid glass" building block. Phase-2 screen agents apply this to the
 * tab bar, sticky headers and bottom sheets.
 *
 * Real backdrop blur only reads well on iOS, so this uses `expo-blur`'s
 * `BlurView` there and falls back to a solid (near-opaque) surface on Android
 * and web, where blur is weak/janky. Pass `fallbackColor` — the design's glass
 * chrome sits on `#fffdf8` (tab bar) — plus an optional `fallbackOpacity`.
 *
 * Always give it a `borderRadius` (and set `overflow:'hidden'` via style) if
 * you want the blur clipped to rounded corners.
 */
export function GlassSurface({
  intensity = 40,
  tint = 'light',
  fallbackColor = '#fffdf8',
  fallbackOpacity = 0.94,
  style,
  children,
}: {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  fallbackColor?: string;
  fallbackOpacity?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}) {
  // iOS gets true backdrop blur; everywhere else a graceful solid fallback.
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={tint} style={[styles.base, style]}>
        {children}
      </BlurView>
    );
  }
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: fallbackColor, opacity: fallbackOpacity },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});

export default GlassSurface;
