import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { KoreanKeyboard } from '@/components/korean-keyboard';
import { TextField, type TextFieldProps } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  appendJamo,
  deleteJamo,
  jamoForKey,
  koreanTyping,
  LAYOUT_NAMES,
  type KeyboardLayout,
} from '@/lib/hangul';
import { getKeyboardLayout, setKeyboardLayout } from '@/lib/keyboard-layout';

type Props = Omit<TextFieldProps, 'value' | 'onChangeText' | 'ref'> & {
  value: string;
  onChangeText: (text: string) => void;
};

const LAYOUTS = Object.keys(LAYOUT_NAMES) as KeyboardLayout[];

/**
 * A text field for Korean. On the web, where a computer usually has no Korean
 * keyboard, it types Korean from the Latin keys (in the position of a Korean
 * keyboard, for the chosen layout) and shows an on-screen Korean keyboard;
 * "A" switches back to Latin letters. On phones and tablets it is a plain
 * field: their own keyboard has Korean.
 */
export function KoreanTextField({ value, onChangeText, ...rest }: Props) {
  const [korean, setKorean] = useState(true);
  const [layout, setLayout] = useState<KeyboardLayout>('qwerty');
  const inputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    getKeyboardLayout().then(setLayout, () => {}); // keeps QWERTY if storage fails
  }, []);

  if (Platform.OS !== 'web') {
    return <TextField value={value} onChangeText={onChangeText} {...rest} />;
  }

  // A click on the on-screen keyboard takes the focus away from the field;
  // give it back so typing and Enter keep working.
  function typeOnScreen(next: string) {
    onChangeText(next);
    inputRef.current?.focus();
  }

  function nextLayout() {
    const next = LAYOUTS[(LAYOUTS.indexOf(layout) + 1) % LAYOUTS.length];
    setLayout(next);
    setKeyboardLayout(next);
    inputRef.current?.focus();
  }

  return (
    <View style={styles.wrapper}>
      <TextField
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChangeText(korean ? koreanTyping(value, next, layout) : next)}
        {...rest}
      />
      <View style={styles.modeRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.modeHint}>
          {korean
            ? `Your keys type Korean (r = ㄱ, ${layout === 'qwertz' ? 'z' : 'y'} = ${jamoForKey('y')})`
            : 'Your keys type Latin letters'}
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
        <>
          <KoreanKeyboard
            layout={layout}
            onJamo={(jamo) => typeOnScreen(appendJamo(value, jamo))}
            onBackspace={() => typeOnScreen(deleteJamo(value))}
            onSpace={() => typeOnScreen(`${value} `)}
          />
          <Pressable
            onPress={nextLayout}
            accessibilityRole="button"
            accessibilityLabel={`Keyboard layout: ${LAYOUT_NAMES[layout]}. Change`}
            hitSlop={Spacing.two}
            style={styles.layoutButton}>
            <ThemedText type="small" themeColor="textSecondary">
              Your keyboard: {LAYOUT_NAMES[layout]} · change
            </ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeHint: { flexShrink: 1 },
  layoutButton: { alignSelf: 'center' },
});
