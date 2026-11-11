import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows a spinner instead of the title and blocks presses. */
  busy?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, busy }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: theme.tint }
          : { borderWidth: 1, borderColor: theme.border },
        (inactive || pressed) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? '#ffffff' : theme.text} />
      ) : (
        <ThemedText style={primary ? styles.primaryText : undefined}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  primaryText: { color: '#ffffff', fontWeight: 600 },
  dimmed: { opacity: 0.5 },
});
