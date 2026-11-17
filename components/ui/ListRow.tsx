import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, line, radius } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { Icon } from '../Icon';

/**
 * The workhorse row inside a {@link Card}: an optional tinted icon tile, a
 * title + optional subtitle, and a right slot (a status {@link Pill}, a value
 * string, a toggle, or the default chevron). Seen on the pet profile (meal
 * times, meds, records), settings and household screens.
 *
 * Compose several inside one Card and set `divider` on all but the last for the
 * inset hairline the design uses between rows. Pass `onPress` to make the whole
 * row tappable.
 */
export function ListRow({
  icon,
  iconBg,
  iconColor,
  iconLarge = false,
  title,
  subtitle,
  right,
  showChevron,
  onPress,
  divider = false,
  style,
}: {
  icon?: React.ComponentProps<typeof Icon>['name'];
  iconBg?: string;
  iconColor?: string;
  /** 34px rounded tile (default 30px). */
  iconLarge?: boolean;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Force the trailing chevron even when `right` is unset (default: shown when nothing else). */
  showChevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
  style?: ViewStyle;
}) {
  const chevron = showChevron ?? (!right);
  const tileSize = iconLarge ? 34 : 30;
  const body = (
    <>
      {icon && (
        <View
          style={[
            styles.tile,
            {
              width: tileSize,
              height: tileSize,
              borderRadius: iconLarge ? radius.iconTile : radius.iconTileSm,
              backgroundColor: iconBg ?? '#f4f0e6',
            },
          ]}
        >
          <Icon name={icon} size={iconLarge ? 17 : 16} color={iconColor ?? ink.muted} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {chevron && <Icon name="chevronRight" size={15} color="#c0b8a8" strokeWidth={2.3} />}
    </>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={[styles.row, style]}>{body}</View>
      )}
      {divider && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.6 },
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: 14, color: ink.primary },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: ink.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: line.hairline, marginHorizontal: 16 },
});

export default ListRow;
