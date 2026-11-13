import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { KoreanKeyboard } from '@/components/korean-keyboard';
import { TextField, type TextFieldProps } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { appendJamo, deleteJamo, koreanTyping } from '@/lib/hangul';

type Props = Omit<TextFieldProps, 'value' | 'onChangeText' | 'ref'> & {
  value: string;
  onChangeText: (text: string) => void;
};

/**
 * A text field for Korean. On the web, where a computer usually has no Korean
 * keyboard, it types Korean from the Latin keys (r = ㄱ, k = ㅏ, …) and shows
 * an on-screen Korean keyboard; "A" switches back to Latin letters. On phones
 * and tablets it is a plain field: their own keyboard has Korean.
 */
export function KoreanTextField({ value, onChangeText, ...rest }: Props) {
  const [korean, setKorean] = useState(true);
  const inputRef = useRef<TextInputInstance>(null);

  if (Platform.OS !== 'web') {
    return <TextField value={value} onChangeText={onChangeText} {...rest} />;
  }

  // A click on the on-screen keyboard takes the focus away from the field;
  // give it back so typing and Enter keep working.
  function typeOnScreen(next: string) {
    onChangeText(next);
    inputRef.current?.focus();
  }

  return (
    <View style={styles.wrapper}>
      <TextField
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChangeText(korean ? koreanTyping(value, next) : next)}
        {...rest}
      />
      <View style={styles.modeRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.modeHint}>
          {korean ? 'Your keys type Korean (r = ㄱ, k = ㅏ)' : 'Your keys type Latin letters'}
        </ThemedText>
        <Pressable
          onPress={() => {
            setKorean(!korean);
            inputRef.current?.focus();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: korean }}
          accessibilityLabel="Korean typing"
          hitSlop={Spacing.two}>
          <ThemedText type="smallBold">{korean ? '한 → A' : 'A → 한'}</ThemedText>
        </Pressable>
      </View>
      {korean && (
        <KoreanKeyboard
          onJamo={(jamo) => typeOnScreen(appendJamo(value, jamo))}
          onBackspace={() => typeOnScreen(deleteJamo(value))}
          onSpace={() => typeOnScreen(`${value} `)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeHint: { flexShrink: 1 },
});
