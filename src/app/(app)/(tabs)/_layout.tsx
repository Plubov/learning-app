import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

/** An emoji as tab icon: full strength when the tab is open, faded otherwise. */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={[styles.icon, !focused && styles.faded]}>{emoji}</Text>;
}

/**
 * The main areas of the app, switched with the bar at the bottom: Today
 * (next lesson, today's goal, reviews), Courses (courses and decks), Focus
 * (the study timer) and Stats (statistics, goals and settings). Every other
 * screen is pushed above the tabs by the stack in (app)/_layout.tsx.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useT();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: theme.tint }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: t('tabs.courses'),
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
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabs.stats'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22, lineHeight: 28 },
  faded: { opacity: 0.45 },
});
