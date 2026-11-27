import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoalBar } from '@/components/goal-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

/**
 * The app opens on Home, even though Stats is the first tab from the left.
 * (Read by Expo Router; the folder name "(tabs)" is not part of URLs, so "/"
 * is Home and "/stats" is Stats.)
 */
export const unstable_settings = { initialRouteName: 'index' };

/** An emoji as tab icon: full strength when the tab is open, faded otherwise. */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={[styles.icon, !focused && styles.faded]}>{emoji}</Text>;
}

/** The gear at the top left of every tab: opens the settings (language, sound, voices, keyboard, account). */
function SettingsButton() {
  const { t } = useT();
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={t('settings.title')}
      hitSlop={Spacing.two}
      style={({ pressed }) => pressed && styles.faded}>
      <Text style={styles.gear}>⚙️</Text>
    </Pressable>
  );
}

/**
 * The header of every tab: settings button and title, and below them
 * today's goal. Being part of the header, the goal bar stays in place while
 * the tab's content scrolls.
 */
function TabHeader({ title }: { title: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={[styles.header, { paddingTop: insets.top, borderBottomColor: theme.border }]}>
      <View style={styles.headerRow}>
        <SettingsButton />
        <ThemedText style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
      </View>
      <GoalBar />
    </ThemedView>
  );
}

/**
 * The main areas of the app, switched with the bar at the bottom: Stats
 * (statistics and daily goals), Home (reviews and the next lesson), Courses
 * & decks, and Focus (the study timer). Every other screen is pushed above
 * the tabs by the stack in (app)/_layout.tsx and covers the tab bar.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useT();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        header: ({ options }) => <TabHeader title={options.title ?? ''} />,
      }}>
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabs.stats'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          // The full name in the header; a short one fits under the icon.
          title: t('tabs.library'),
          tabBarLabel: t('tabs.courses'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: t('tabs.focus'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="⏱️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22, lineHeight: 28 },
  faded: { opacity: 0.45 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  title: { flex: 1, fontSize: 18, lineHeight: 26, fontWeight: 700 },
  gear: { fontSize: 22, lineHeight: 28 },
});
