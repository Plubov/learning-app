import type { Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label?: string;
  /** Handle to the input, e.g. to focus it again from code. */
  ref?: Ref<TextInputInstance>;
};

/** A themed text input with an optional label above it. */
export function TextField({ label, style, multiline, ref, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      {label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
