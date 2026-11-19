import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * The PawClock logo, "Liquid Glass Paw": a frosted glass disc with clock ticks on a pale
 * aurora tile, a violet-to-teal paw pressed into the centre. Same artwork as the master
 * file assets/logo/pawclock-logo.svg (viewBox 0 0 120) — don't edit paths or colours here
 * without changing that file too.
 *
 * At 32px and below the rim ticks and highlight are dropped so the paw stays legible.
 */
export function BrandMark({ size = 52 }: { size?: number }) {
  // Gradient ids must be unique per instance: on web they share one DOM.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bg = `pcbg${uid}`;
  const paw = `pcpaw${uid}`;
  const small = size <= 32;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="PawClock logo" role="img">
      <Defs>
        <LinearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#e8f6f1" />
          <Stop offset="0.55" stopColor="#e3ebff" />
          <Stop offset="1" stopColor="#ffe9dc" />
        </LinearGradient>
        <LinearGradient id={paw} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6c5ce7" />
          <Stop offset="1" stopColor="#17a398" />
        </LinearGradient>
      </Defs>
      <Rect x="4" y="4" width="112" height="112" rx="27" fill={`url(#${bg})`} />
      {!small && (
        <>
          <Circle cx="38" cy="30" r="17" fill="#3ec6b8" opacity={0.18} />
          <Circle cx="88" cy="88" r="20" fill="#7c6cf0" opacity={0.15} />
        </>
      )}
      <Circle cx="60" cy="60" r="37" fill="#ffffff" opacity={0.5} />
      <Circle cx="60" cy="60" r="37" fill="none" stroke="#ffffff" strokeWidth={1.6} opacity={0.9} />
      {!small && (
        <>
          <G stroke="#8b93a7" strokeWidth={2.4} strokeLinecap="round" opacity={0.65}>
            <Line x1="60" y1="27.5" x2="60" y2="32" />
            <Line x1="83" y1="37" x2="79.8" y2="40.2" />
            <Line x1="92.5" y1="60" x2="88" y2="60" />
            <Line x1="83" y1="83" x2="79.8" y2="79.8" />
            <Line x1="60" y1="92.5" x2="60" y2="88" />
            <Line x1="37" y1="83" x2="40.2" y2="79.8" />
            <Line x1="27.5" y1="60" x2="32" y2="60" />
            <Line x1="37" y1="37" x2="40.2" y2="40.2" />
          </G>
          <Line x1="60" y1="27.5" x2="60" y2="33.5" stroke="#17a398" strokeWidth={3.2} strokeLinecap="round" />
          <Path d="M38 44a30 30 0 0 1 15-9" fill="none" stroke="#ffffff" strokeWidth={3.4} strokeLinecap="round" opacity={0.95} />
        </>
      )}
      <G fill={`url(#${paw})`}>
        <Ellipse cx="43.5" cy="57" rx="4.6" ry="6.4" transform="rotate(-16 43.5 57)" />
        <Ellipse cx="54" cy="50.5" rx="4.6" ry="6.6" transform="rotate(-5 54 50.5)" />
        <Ellipse cx="64.5" cy="50.5" rx="4.6" ry="6.6" transform="rotate(5 64.5 50.5)" />
        <Ellipse cx="74.5" cy="57" rx="4.6" ry="6.4" transform="rotate(16 74.5 57)" />
        <Path d="M59 62.5c7.6 0 13 5.7 13 11.1 0 4-3 6.4-6.7 6.4-2.3 0-3.9-.9-6.3-.9s-4 .9-6.3.9c-3.7 0-6.7-2.4-6.7-6.4 0-5.4 5.4-11.1 13-11.1Z" />
      </G>
    </Svg>
  );
}

export default BrandMark;
