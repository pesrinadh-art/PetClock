import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { green, line, ink } from '../theme/colors';

// Redesign pill toggle: green.mid track when on, warm hairline track when off,
// white thumb. Pet-owner redesign: slightly larger (50x30, 26px thumb) and the
// press area is padded to >= 48px tall so it's an easy one-thumb tap.
const TRACK_W = 50;
const TRACK_H = 30;
const THUMB = 26;

export function Toggle({
  on,
  onToggle,
  'aria-label': ariaLabel,
}: {
  on: boolean;
  onToggle?: () => void;
  'aria-label'?: string;
}) {
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: on ? 1 : 0,
      // Colour interpolation can't use the native driver.
      useNativeDriver: false,
      speed: 24,
      bounciness: 6,
    }).start();
  }, [on, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [line.dashed, green.mid],
  });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, TRACK_W - THUMB - 2] });

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={{ top: 9, bottom: 9, left: 8, right: 8 }}
      role="switch"
      aria-label={ariaLabel}
      aria-checked={on}
    >
      <Animated.View
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: 999,
          backgroundColor: trackColor,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: ink.onDark,
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
