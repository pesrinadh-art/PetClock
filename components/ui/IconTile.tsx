import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import { radius, tones, type Tone } from '../../theme/colors';
import { Icon, type IconName } from '../Icon';

/**
 * A rounded tinted square holding one icon - the leading visual in rows,
 * banners and tiles. Colour comes from `tone` (role), never decoration.
 *
 *   <IconTile icon="bowl" tone="food" />          // 40px default
 *   <IconTile icon="drop" tone="pee" size={52} />
 */
export function IconTile({
  icon,
  tone = 'neutral',
  size = 40,
  bg,
  color,
  style,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  /** Escape hatch - prefer `tone`. */
  bg?: string;
  color?: string;
  style?: ViewStyle;
}) {
  const t = tones[tone];
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size >= 44 ? radius.tile : radius.iconTile,
          backgroundColor: bg ?? t.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={color ?? t.ink} strokeWidth={2.1} />
    </View>
  );
}

export default IconTile;
