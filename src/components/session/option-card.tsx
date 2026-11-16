import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { usePop, useShake } from '@/components/session/motion';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'done';

type Props = {
  label: string;
  state: OptionState;
  onPress: () => void;
  disabled?: boolean;
  /** Smaller, for word tiles. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A tappable answer: an option of a multiple-choice question, one side of a
 * pair, or a word tile. It bounces when it turns out right and shakes when
 * it turns out wrong.
 */
export function OptionCard({ label, state, onPress, disabled, compact, style }: Props) {
  const theme = useTheme();
  const { scale, pop } = usePop();
  const { offset, shake } = useShake();

  useEffect(() => {
    if (state === 'correct') pop();
    if (state === 'wrong') shake();
    // Runs when the state changes; pop and shake only start an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const colors = {
    idle: { borderColor: theme.border, backgroundColor: theme.backgroundElement },
    selected: { borderColor: theme.tint, backgroundColor: theme.backgroundSelected },
    correct: { borderColor: theme.success, backgroundColor: theme.successSoft },
    wrong: { borderColor: theme.danger, backgroundColor: theme.dangerSoft },
    done: { borderColor: theme.border, backgroundColor: theme.background },
  }[state];

  return (
    <Animated.View style={[{ transform: [{ scale }, { translateX: offset }] }, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: state === 'selected', disabled }}
        style={({ pressed }) => [
          compact ? styles.tile : styles.card,
          colors,
          state === 'done' && styles.faded,
          pressed && styles.pressed,
        ]}>
        <ThemedText style={compact ? styles.tileText : styles.cardText}>{label}</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    // A thicker lower edge makes the card look like a key that can be pressed.
    borderBottomWidth: 4,
  },
  tile: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two + Spacing.one,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  cardText: { fontSize: 17, lineHeight: 24 },
  tileText: { fontSize: 18, lineHeight: 26 },
  faded: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
});
