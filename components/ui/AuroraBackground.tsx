import * as React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { aurora } from '../../theme/colors';

/**
 * The light aurora field every screen sits on (design v2): a sky → lilac → peach →
 * mint diagonal wash with a blue glow top-right and a pink glow bottom-left.
 * Purely decorative and pointer-transparent; render it as the first child of a
 * full-screen container (see {@link Screen}).
 */
export function AuroraBackground({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        colors={[...aurora.gradient]}
        locations={[...aurora.gradientStops]}
        // 165deg in CSS: top-left-ish to bottom-right-ish, mostly vertical.
        start={{ x: 0.37, y: 0 }}
        end={{ x: 0.63, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="auroraBlue" cx="100%" cy="0%" rx="70%" ry="38%" fx="100%" fy="0%">
            <Stop offset="0" stopColor="rgb(110,160,255)" stopOpacity={0.45} />
            <Stop offset="1" stopColor="rgb(110,160,255)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraPink" cx="0%" cy="85%" rx="75%" ry="40%" fx="0%" fy="85%">
            <Stop offset="0" stopColor="rgb(255,150,190)" stopOpacity={0.35} />
            <Stop offset="1" stopColor="rgb(255,150,190)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#auroraBlue)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#auroraPink)" />
      </Svg>
    </View>
  );
}

export default AuroraBackground;
