import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** A thin horizontal bar filled to `value` (0..1). */
export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.fill, { backgroundColor: theme.tint, width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
