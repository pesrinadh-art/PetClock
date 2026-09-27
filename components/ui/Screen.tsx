import * as React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { line, space, surface } from '../../theme/colors';

/**
 * Standard screen scaffold: cream background, safe-area, a fixed `header`,
 * a scrolling body with the 20px gutter, and an optional sticky `footer` for
 * the screen's primary action (thumb zone!).
 *
 *   <Screen header={<PetGreeting pet={pet} />} tabBar>
 *     ...sections...
 *   </Screen>
 *
 *   <Screen header={<ScreenHeader title="Add a pet" onBack={...} />}
 *           footer={<Button label="Save Mochi" fullWidth onPress={save} />}>
 *     ...form...
 *   </Screen>
 *
 * `tabBar` adds bottom padding so the last card clears the tab bar + FAB.
 * `scroll={false}` renders a plain flex body (for FlatList screens).
 */
export function Screen({
  header,
  footer,
  children,
  scroll = true,
  tabBar = false,
  edges = ['top'],
  contentStyle,
  keyboardShouldPersistTaps = 'handled',
  style,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  scroll?: boolean;
  tabBar?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  style?: ViewStyle;
}) {
  const bottomPad = tabBar ? space.tabScrollBottom : footer ? space.lg : space.xxl;
  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, contentStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {footer ? <StickyFooter>{footer}</StickyFooter> : null}
    </SafeAreaView>
  );
}

/**
 * Bottom action bar for a screen's main CTA(s). Handles the home-indicator
 * inset. Put one full-width primary <Button>, optionally with a ghost one.
 */
export function StickyFooter({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.sm) + 4 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.gutter, gap: 0 },
  footer: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    gap: space.xs,
    backgroundColor: surface.tabBar,
    borderTopWidth: 1,
    borderTopColor: line.border,
  },
});

export default Screen;
