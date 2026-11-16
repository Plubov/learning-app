import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useNativeDriver } from '@/components/session/motion';

const COLORS = ['#208AEF', '#2A9D46', '#F5A623', '#E5484D', '#8E4EC6', '#12A594'];
const PIECES = 36;
const FALL_MS = 2200;

type Piece = { left: number; delay: number; size: number; color: string; spin: number; drift: number };

function makePieces(width: number): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    left: Math.random() * width,
    delay: Math.random() * 500,
    size: 8 + Math.random() * 8,
    color: COLORS[i % COLORS.length],
    spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
    drift: (Math.random() - 0.5) * 120,
  }));
}

/**
 * Coloured paper falling once over the whole screen, for the end of a
 * session. It ignores touches, so buttons under it keep working.
 */
export function Confetti() {
  const { width, height } = useWindowDimensions();
  const [pieces] = useState(() => makePieces(width));
  const [progress] = useState(() => pieces.map(() => new Animated.Value(0)));

  useEffect(() => {
    const animation = Animated.parallel(
      progress.map((value, i) =>
        Animated.timing(value, {
          toValue: 1,
          duration: FALL_MS,
          delay: pieces[i].delay,
          easing: Easing.in(Easing.quad),
          useNativeDriver,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [pieces, progress]);

  return (
    <View style={styles.overlay} pointerEvents="none">
      {pieces.map((piece, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: -20,
            left: piece.left,
            width: piece.size,
            height: piece.size * 0.6,
            borderRadius: 2,
            backgroundColor: piece.color,
            opacity: progress[i].interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { translateX: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] }) },
              {
                rotate: progress[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0rad', `${piece.spin * Math.PI}rad`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
});
