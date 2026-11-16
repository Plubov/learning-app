import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type Props = {
  /** How far the session is, 0..1. */
  progress: number;
  /** Sound setting; null while it is loading (the switch is hidden then). */
  sound: boolean | null;
  onToggleSound: () => void;
  /** Leaves the session early. */
  onClose: () => void;
  /** Stays at the bottom of the screen: the button or the feedback for the page. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The frame of every step-by-step session (guided lesson, practice): a bar
 * on top with close, progress and sound; the page in the middle; and the
 * action at the bottom edge, where the thumb is.
 */
export function SessionLayout({ progress, sound, onToggleSound, onClose, footer, children }: Props) {
  const theme = useTheme();
  const { t } = useT();
  // The bar glides to its new length instead of jumping.
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(shown, {
      toValue: Math.min(1, Math.max(0, progress)),
      duration: 350,
      useNativeDriver: false, // width cannot be animated natively
    }).start();
  }, [shown, progress]);
  const width = shown.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.row}>
          <View style={styles.topBar}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={Spacing.three}>
              <ThemedText style={styles.icon} themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              <Animated.View style={[styles.bar, { backgroundColor: theme.success, width }]} />
            </View>
            {sound !== null && (
              <Pressable
                onPress={onToggleSound}
                accessibilityRole="switch"
                accessibilityState={{ checked: sound }}
                accessibilityLabel={t('common.sound')}
                hitSlop={Spacing.three}>
                <ThemedText style={styles.icon}>{sound ? '🔊' : '🔇'}</ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>{children}</View>
        </ScrollView>

        {footer && (
          <View style={styles.row}>
            <View style={styles.footer}>{footer}</View>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { alignItems: 'center' },
  topBar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  icon: { fontSize: 20, lineHeight: 28 },
  track: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 6 },
  // The page is centred in the space between the bars when it is short.
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  footer: { width: '100%', maxWidth: MaxContentWidth, padding: Spacing.three, gap: Spacing.two },
});
