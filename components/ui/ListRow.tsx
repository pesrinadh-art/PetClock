import * as React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ink, line, radius, space, tones, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { Icon } from '../Icon';

/**
 * The workhorse row inside a {@link Card}: an optional tinted icon tile (or any
 * `leading` node such as a <PetAvatar>), a title + optional subtitle, and a
 * right slot (a status {@link Pill}, a value string, a toggle, or the default
 * chevron). Min height 60px so every row is an easy tap.
 *
 * Compose several inside one Card and set `divider` on all but the last for the
 * inset hairline between rows. Pass `onPress` to make the whole row tappable.
 *
 * Colour the tile with `tone` (preferred) or legacy `iconBg`/`iconColor`.
 */
export function ListRow({
  icon,
  iconBg,
  iconColor,
  iconLarge = false,
  tone,
  leading,
  title,
  subtitle,
  right,
  showChevron,
  onPress,
  divider = false,
  accessibilityLabel,
  style,
}: {
  icon?: React.ComponentProps<typeof Icon>['name'];
  iconBg?: string;
  iconColor?: string;
  /** 44px rounded tile (default 38px). */
  iconLarge?: boolean;
  tone?: Tone;
  /** Custom leading node (e.g. <PetAvatar size={40} />). Replaces the icon tile. */
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Force the trailing chevron even when `right` is unset (default: shown when tappable and nothing else). */
  showChevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const chevron = showChevron ?? (!right && !!onPress);
  const tileSize = iconLarge ? 44 : 38;
  const t = tone ? tones[tone] : null;
  const body = (
    <>
      {leading ??
        (icon && (
          <View
            style={[
              styles.tile,
              {
                width: tileSize,
                height: tileSize,
                borderRadius: iconLarge ? radius.tile : radius.iconTile,
                backgroundColor: iconBg ?? t?.bg ?? '#f4f0e6',
              },
            ]}
          >
            <Icon name={icon} size={iconLarge ? 21 : 19} color={iconColor ?? t?.ink ?? ink.muted} strokeWidth={2.1} />
          </View>
        ))}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.sub} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {chevron && <Icon name="chevronRight" size={17} color={ink.placeholder} strokeWidth={2.3} />}
    </>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          onPress={onPress}
          role="button"
          aria-label={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={[styles.row, style]}>{body}</View>
      )}
      {divider && <View style={[styles.divider, !(icon || leading) && styles.dividerFlush]} />}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 60,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  pressed: { backgroundColor: '#f7f4ec' },
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1, minWidth: 0 },
  title: { ...type.subhead, color: ink.primary },
  sub: { ...type.bodySm, color: ink.muted, marginTop: 1 },
  divider: { height: 1, backgroundColor: line.hairline, marginLeft: space.lg + 38 + space.sm, marginRight: space.lg },
  dividerFlush: { marginLeft: space.lg },
});

export default ListRow;
