import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { accent, glass } from '../theme/colors';

// Aurora Minimal pill toggle (design v2 `.toggle`): accent track when on, translucent
// ink track with a hairline border when off, white knob. 46x28 with a 20px knob.
const OFF_TRACK = 'rgba(14,14,20,0.08)';

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
      bounciness: 4,
    }).start();
  }, [on, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [OFF_TRACK, accent.primary],
  });
  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [glass.border2, 'rgba(109,93,246,0)'],
  });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 21] });

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
          width: 46,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor,
          backgroundColor: trackColor,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: accent.onAccent,
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
