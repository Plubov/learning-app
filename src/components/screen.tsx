import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * Standard screen body: scrolls, keeps clear of the phone's bottom edge,
 * and limits the width on large screens (tablet, desktop browser).
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: Spacing.three, alignItems: 'center' },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
});
