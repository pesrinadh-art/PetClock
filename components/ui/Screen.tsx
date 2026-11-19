import * as React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { AuroraBackground } from './AuroraBackground';

/**
 * Bottom padding a scroll view inside a tab screen needs so its last row clears the
 * floating glass tab bar (62px bar + 22px gap + breathing room). Add the bottom
 * safe-area inset on top of this only if the screen's SafeAreaView excludes 'bottom'.
 */
export const TAB_BAR_CLEARANCE = 112;

/**
 * Root of every screen: draws the aurora field, then a transparent SafeAreaView.
 * Replaces `<SafeAreaView style={{ flex: 1, backgroundColor: surface.app }}>`.
 */
export function Screen({
  edges = ['top'],
  style,
  children,
}: {
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.root}>
      <AuroraBackground />
      <SafeAreaView edges={edges} style={[styles.safe, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },
});

export default Screen;
