import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { green, line, ink } from '../theme/colors';

// Redesign pill toggle (screen_2f): green.mid track when on, warm hairline track
// when off, white thumb. Sizing mirrors the mockup (44×26, 22px thumb).
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
      useNativeDriver: false,
      speed: 24,
      bounciness: 6,
    }).start();
  }, [on, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [line.border, green.mid],
  });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      role="switch"
      aria-label={ariaLabel}
      aria-checked={on}
    >
      <Animated.View
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          backgroundColor: trackColor,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
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
