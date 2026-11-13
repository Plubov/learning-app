import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { KEYBOARD_ROWS } from '@/lib/hangul';

type Props = {
  onJamo: (jamo: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
};

/**
 * On-screen Korean keyboard in the standard two-set layout (두벌식). Each key
 * also shows the Latin letter at the same place, which types the same jamo
 * on the computer's own keyboard. Shift applies to the next key only.
 */
export function KoreanKeyboard({ onJamo, onBackspace, onSpace }: Props) {
  const [shift, setShift] = useState(false);

  function press(jamo: string) {
    onJamo(jamo);
    setShift(false);
  }

  return (
    <View style={styles.keyboard}>
      {KEYBOARD_ROWS.map((row, index) => (
        <View key={index} style={styles.row}>
          {index === 2 && (
            <Key label="⇧" hint="Shift" active={shift} wide onPress={() => setShift(!shift)} />
          )}
          {row.map(([key, jamo, shifted]) => (
            <Key
              key={key}
              label={shift ? shifted : jamo}
              hint={shift && shifted !== jamo ? key.toUpperCase() : key}
              onPress={() => press(shift ? shifted : jamo)}
            />
          ))}
          {index === 2 && <Key label="⌫" hint="Back" wide onPress={onBackspace} />}
        </View>
      ))}
      <View style={styles.row}>
        <Key label=" " hint="Space" space onPress={onSpace} />
      </View>
    </View>
  );
}

type KeyProps = {
  label: string;
  /** Small text under the jamo: the Latin key, or the key's name. */
  hint: string;
  onPress: () => void;
  active?: boolean;
  wide?: boolean;
  space?: boolean;
};

function Key({ label, hint, onPress, active, wide, space }: KeyProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint === 'Space' || hint === 'Back' || hint === 'Shift' ? hint : label}
      style={({ pressed }) => [
        styles.key,
        wide && styles.wide,
        space && styles.space,
        {
          borderColor: theme.border,
          backgroundColor: active || pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <ThemedText style={styles.jamo}>{label}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        {hint}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboard: { gap: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one },
  key: {
    flex: 1,
    maxWidth: 52,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.one + Spacing.half,
  },
  wide: { flex: 1.5, maxWidth: 78 },
  space: { flex: 0, width: '60%', maxWidth: 320 },
  jamo: { fontSize: 18, lineHeight: 24 },
  hint: { fontSize: 10, lineHeight: 12 },
});
