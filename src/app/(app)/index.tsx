import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const { session } = useSession();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Learning App</ThemedText>
        <ThemedText themeColor="textSecondary">Logged in as {session?.user.email}</ThemedText>
        {/* After sign-out the session becomes null and the root layout's
            guard sends us back to the sign-in screen. */}
        <Pressable
          onPress={() => supabase.auth.signOut()}
          style={({ pressed }) => [
            styles.button,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <ThemedText>Sign out</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  button: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  pressed: { opacity: 0.7 },
});
