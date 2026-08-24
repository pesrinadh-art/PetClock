import * as React from 'react';
import Svg, { Circle, Path, Rect, type SvgProps } from 'react-native-svg';

/**
 * PawClock drawn icon set (Phase-1 foundation).
 *
 * Every glyph's path data is lifted verbatim from the approved redesign HTML
 * (design/screen_2*.html), so icons match the mockups pixel-for-pixel. They
 * replace the old emoji throughout the app.
 *
 * Style contract (matches the design): 24×24 viewBox, fill none, stroke
 * currentColor, round caps + joins, ~2px stroke. Pass `color` to tint (defaults
 * to currentColor-ish `#2a2724`), `size` for width/height, `strokeWidth` to
 * override. `filled` swaps to a solid fill (used for the paw watermark).
 *
 * Usage:  <Icon name="paw" size={20} color={green.mid} />
 */

export type IconName =
  // navigation / chrome
  | 'home'
  | 'users' // SHARED tab + household
  | 'calendar' // APPTS tab
  | 'paw' // PETS tab + brand mark
  | 'bell'
  | 'gear'
  | 'plus'
  | 'check'
  | 'chevronRight'
  | 'chevronLeft'
  | 'close'
  | 'dots'
  // logs / care
  | 'clock'
  | 'drop' // pee
  | 'poo'
  | 'bowl' // fed / food
  | 'pill' // meds
  | 'sun' // breakfast
  | 'moon' // dinner
  // appointment types
  | 'vet' // clinic building (a.k.a. stethoscope role)
  | 'stethoscope' // alias of vet
  | 'vaccine' // syringe
  | 'scissors' // groom
  | 'mapPin'
  // account / sharing
  | 'lock'
  | 'mail'
  | 'eye'
  | 'login'
  | 'user'
  | 'userPlus'
  | 'alert'
  | 'share'
  | 'copy'
  | 'key';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Solid-fill variant (e.g. the hero paw watermark). Default: outlined. */
  filled?: boolean;
} & Omit<SvgProps, 'color'>;

// Each glyph renders its inner primitives; stroke/fill are applied by the wrapper.
const GLYPHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5 9.5V21h14V9.5" />
    </>
  ),
  users: (
    <>
      <Path d="M16 20v-2a4 4 0 0 0-8 0v2" />
      <Circle cx={12} cy={8} r={3.2} />
      <Path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M4 20v-1.5a3.5 3.5 0 0 1 2.5-3.35" />
    </>
  ),
  calendar: (
    <>
      <Rect x={3} y={4.5} width={18} height={16.5} rx={3} />
      <Path d="M16 2.5v4M8 2.5v4M3 10h18" />
    </>
  ),
  paw: (
    <>
      <Circle cx={11} cy={4} r={2} />
      <Circle cx={18} cy={8} r={2} />
      <Circle cx={20} cy={16} r={2} />
      <Path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  gear: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82 2 2 0 1 1-2.83 2.83 1.65 1.65 0 0 0-2.82 1.18 2 2 0 1 1-4 0 1.65 1.65 0 0 0-2.82-1.18 2 2 0 1 1-2.83-2.83A1.65 1.65 0 0 0 3.6 14a2 2 0 1 1 0-4 1.65 1.65 0 0 0 1.18-2.82 2 2 0 1 1 2.83-2.83A1.65 1.65 0 0 0 10 3.09a2 2 0 1 1 4 0 1.65 1.65 0 0 0 2.82 1.18 2 2 0 1 1 2.83 2.83A1.65 1.65 0 0 0 20.9 10a2 2 0 1 1 0 4 1.65 1.65 0 0 0-1.5 1Z" />
    </>
  ),
  plus: <Path d="M5 12h14M12 5v14" />,
  check: <Path d="M20 6 9 17l-5-5" />,
  chevronRight: <Path d="m9 6 6 6-6 6" />,
  chevronLeft: <Path d="m15 18-6-6 6-6" />,
  close: <Path d="M18 6 6 18M6 6l12 12" />,
  dots: <Path d="M5 12h.01M12 12h.01M19 12h.01" />,
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 8v4l3 2" />
    </>
  ),
  drop: <Path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z" />,
  poo: (
    <Path d="M8.5 21h7a3 3 0 0 0 .6-5.94A3 3 0 0 0 13.5 10 3 3 0 0 0 12 6.5 3 3 0 0 0 9 10a3 3 0 0 0-2.1 5.06A3 3 0 0 0 8.5 21Z" />
  ),
  bowl: (
    <>
      <Path d="M4 12h16a8 8 0 0 1-16 0Z" />
      <Path d="M12 4v4" />
    </>
  ),
  pill: (
    <>
      <Path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7Z" />
      <Path d="m8.5 8.5 7 7" />
    </>
  ),
  sun: (
    <>
      <Circle cx={12} cy={14} r={4} />
      <Path d="M12 5v2M5 14H3M21 14h-2M6.5 8.5 5 7M17.5 8.5 19 7" />
    </>
  ),
  moon: <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />,
  vet: (
    <>
      <Path d="M4 21V9l8-5 8 5v12" />
      <Path d="M12 10v5M9.5 12.5h5" />
    </>
  ),
  stethoscope: (
    <>
      <Path d="M4 21V9l8-5 8 5v12" />
      <Path d="M12 10v5M9.5 12.5h5" />
    </>
  ),
  vaccine: (
    <>
      <Path d="m18 2 4 4M17 7l3-3" />
      <Path d="M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5Z" />
      <Path d="m9 11 4 4M5 19l-3 3" />
    </>
  ),
  scissors: (
    <>
      <Circle cx={6} cy={6} r={3} />
      <Circle cx={6} cy={18} r={3} />
      <Path d="M20 4 8.5 15.5M20 20 8.5 8.5" />
    </>
  ),
  mapPin: (
    <>
      <Path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <Circle cx={12} cy={10} r={2.6} />
    </>
  ),
  lock: (
    <>
      <Rect x={4} y={10.5} width={16} height={10.5} rx={2.5} />
      <Path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  mail: (
    <>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  eye: (
    <>
      <Path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <Circle cx={12} cy={12} r={2.8} />
    </>
  ),
  login: (
    <>
      <Path d="M10 17l5-5-5-5" />
      <Path d="M15 12H3M19 4v16" />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={3.4} />
      <Path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  userPlus: (
    <>
      <Path d="M16 20v-2a4 4 0 0 0-8 0v2" />
      <Circle cx={12} cy={8} r={3.2} />
      <Path d="M19 9v6M22 12h-6" />
    </>
  ),
  alert: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 8v5M12 16.5h.01" />
    </>
  ),
  share: (
    <>
      <Path d="M4 12v7a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-7" />
      <Path d="M12 16V3M8 7l4-4 4 4" />
    </>
  ),
  copy: (
    <>
      <Rect x={9} y={9} width={12} height={12} rx={2.5} />
      <Path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
    </>
  ),
  key: (
    <>
      <Circle cx={8} cy={15} r={4} />
      <Path d="m10.8 12.2 8-8 2 2-2 2 1.5 1.5-2 2-1.5-1.5-2 2" />
    </>
  ),
};

export function Icon({
  name,
  size = 24,
  color = '#2a2724',
  strokeWidth = 2,
  filled = false,
  ...rest
}: IconProps) {
  const glyph = GLYPHS[name];
  const strokeProps = filled
    ? { fill: color, stroke: 'none' as const }
    : {
        fill: 'none' as const,
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
      };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} {...rest}>
      {glyph}
    </Svg>
  );
}

export default Icon;
