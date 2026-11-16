import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Small animations shared by the session screens, made with React Native's
 * built-in Animated API (no extra library).
 */

// The native driver runs an animation outside JavaScript on phones; the web
// has no native side, so it animates in JavaScript there.
export const useNativeDriver = Platform.OS !== 'web';

/**
 * Fades its content in while it rises a little. Give it a `key` that changes
 * with the page, so every new page appears this way.
 */
export function Appear({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration: 260, useNativeDriver });
    animation.start();
    return () => animation.stop();
  }, [progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * A value to put into `transform: [{ scale }]` and a function that makes it
 * bounce once: the "pop" of a right answer.
 */
export function usePop(): { scale: Animated.Value; pop: () => void } {
  const [scale] = useState(() => new Animated.Value(1));
  function pop() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 90, useNativeDriver }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver }),
    ]).start();
  }
  return { scale, pop };
}

/**
 * A value to put into `transform: [{ translateX }]` and a function that
 * shakes it left and right: the "no" of a wrong answer.
 */
export function useShake(): { offset: Animated.Value; shake: () => void } {
  const [offset] = useState(() => new Animated.Value(0));
  function shake() {
    Animated.sequence(
      [8, -8, 6, -6, 0].map((toValue) =>
        Animated.timing(offset, { toValue, duration: 55, useNativeDriver }),
      ),
    ).start();
  }
  return { offset, shake };
}
