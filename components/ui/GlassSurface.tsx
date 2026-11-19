import * as React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { glass } from '../../theme/colors';

/**
 * The glass building block (tab bar, sticky headers, sheets, dialogs).
 *
 * iOS gets a real backdrop blur under a translucent white wash; Android and web,
 * where blur is weak or janky, get a near-opaque white panel. Either way the panel
 * has the design's hairline border. Give it a `borderRadius` in `style`.
 *
 * `fallbackColor` is the panel colour off iOS. `fallbackOpacity` is kept for older
 * call sites and is ignored — applying opacity to the container faded its children.
 */
export function GlassSurface({
  intensity = 40,
  tint = 'light',
  fallbackColor = glass.strong,
  style,
  children,
}: {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  fallbackColor?: string;
  /** @deprecated ignored */
  fallbackOpacity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={tint} style={[styles.base, styles.iosWash, style]}>
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.base, { backgroundColor: fallbackColor }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: glass.border },
  iosWash: { backgroundColor: 'rgba(255,255,255,0.55)' },
});

export default GlassSurface;
