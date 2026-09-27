import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, space } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { IconButton } from './IconButton';

/**
 * Header for stack / modal screens (Add pet, Add appointment, Settings,
 * Notifications, History). Back (or close) chip on the left, a readable title
 * with optional subtitle, and a right slot.
 *
 *   <ScreenHeader title="New visit" subtitle="For Mochi" onBack={() => router.back()} />
 *   <ScreenHeader title="Add a pet" backIcon="close" onBack={close} />
 *   <ScreenHeader title="Mochi's history" onBack={...} right={<IconButton .../>} />
 *
 * The primitive does NOT navigate by itself - pass the screen's existing
 * back handler so behaviour is unchanged. No `onBack` = no back button.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backIcon = 'chevronLeft',
  backLabel = 'Go back',
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: 'chevronLeft' | 'close';
  backLabel?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.row, style]}>
      {onBack ? <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} /> : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1} role="heading">
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.gutter - 4,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    minHeight: 60,
  },
  text: { flex: 1, minWidth: 0 },
  title: { ...type.title, color: ink.primary },
  subtitle: { ...type.bodySm, color: ink.muted, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});

export default ScreenHeader;
