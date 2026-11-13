import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { SESSION_CARD_TYPES } from '@/lib/session-cards';
import {
  barHeights,
  formatDuration,
  rememberedPercent,
  weekdayLabel,
  type ReviewStats,
} from '@/lib/stats';
import { supabase } from '@/lib/supabase';

const CHART_DAYS = 14;
const CHART_HEIGHT = 120;

/** The device's time zone, e.g. "Europe/Berlin"; decides where a day begins. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

export default function StatsScreen() {
  const theme = useTheme();
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('review_stats', {
      p_time_zone: deviceTimeZone(),
      p_card_types: SESSION_CARD_TYPES,
      p_days: CHART_DAYS,
    });
    // The function returns jsonb, which the generated types only know as
    // "Json"; its exact shape is documented in the review_stats migration.
    return { data: data as unknown as ReviewStats | null, error };
  }, []);
  const { data: stats, error, loading } = useFocusQuery(load);

  if (error) {
    return (
      <Screen>
        <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>
      </Screen>
    );
  }
  if (loading || !stats) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      </Screen>
    );
  }

  const { today, days, items, due } = stats;
  const todayRemembered = rememberedPercent(today.reviews, today.again);
  const periodReviews = days.reduce((sum, d) => sum + d.reviews, 0);
  const periodAgain = days.reduce((sum, d) => sum + d.again, 0);
  const periodRemembered = rememberedPercent(periodReviews, periodAgain);
  const heights = barHeights(
    days.map((d) => d.reviews),
    CHART_HEIGHT,
  );

  return (
    <Screen>
      <ThemedText type="smallBold">Today</ThemedText>
      <View style={styles.tiles}>
        <Tile value={today.reviews} label="reviews" />
        <Tile value={today.new_items} label="new words" />
        <Tile
          value={todayRemembered === null ? '–' : `${todayRemembered}%`}
          label="remembered"
        />
        <Tile value={formatDuration(today.duration_ms)} label="studied" />
      </View>

      <ThemedText type="smallBold">Last {CHART_DAYS} days</ThemedText>
      <ThemedView type="backgroundElement" style={styles.chartBox}>
        <View style={[styles.chart, { height: CHART_HEIGHT + 16 }]}>
          {days.map((day, index) => (
            <View key={day.date} style={styles.column}>
              {day.reviews > 0 && <ThemedText style={styles.barValue}>{day.reviews}</ThemedText>}
              <View
                style={[styles.bar, { height: heights[index], backgroundColor: theme.tint }]}
              />
            </View>
          ))}
        </View>
        <View style={styles.labels}>
          {days.map((day) => (
            <ThemedText key={day.date} themeColor="textSecondary" style={styles.dayLabel}>
              {weekdayLabel(day.date)}
            </ThemedText>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {periodReviews} reviews
          {periodRemembered !== null && `, ${periodRemembered}% remembered`}
        </ThemedText>
      </ThemedView>

      <ThemedText type="smallBold">Words</ThemedText>
      <View style={styles.tiles}>
        <Tile value={items.known} label="known" />
        <Tile value={items.learning} label="learning" />
        <Tile value={items.not_started} label="not started" />
      </View>

      <ThemedText type="smallBold">Coming up</ThemedText>
      <View style={styles.tiles}>
        <Tile value={due.tomorrow} label="reviews tomorrow" />
        <Tile value={due.next_7_days} label="in the next 7 days" />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Remembered: share of answers not rated “Again”. A word is known once all its cards
        have passed the learning steps.
      </ThemedText>
    </Screen>
  );
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tile}>
      <ThemedText style={styles.tileValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // Two tiles per row on a phone, up to four on a wide screen.
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  tileValue: { fontSize: 24, lineHeight: 32, fontWeight: 600 },
  chartBox: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.half },
  column: { flex: 1, alignItems: 'center' },
  bar: { width: '70%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barValue: { fontSize: 10, lineHeight: 14 },
  labels: { flexDirection: 'row', gap: Spacing.half },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 14 },
});
