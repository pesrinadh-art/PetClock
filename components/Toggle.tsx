import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { colors } from '../theme/colors';

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
    outputRange: [colors.stoneLight, colors.sage],
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
          width: 40,
          height: 22,
          borderRadius: 99,
          backgroundColor: trackColor,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.white,
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
