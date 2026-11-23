import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_LANGUAGES, LANGUAGE_NAMES, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Opened with the menu button (three lines) at the top left of every tab: language, voices, account. */
export default function SettingsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const { t, language, setLanguage } = useT();

  return (
    <Screen>
      <View style={styles.section}>
        <ThemedText style={styles.title}>{t('home.language')}</ThemedText>
        <View style={styles.languages}>
          {APP_LANGUAGES.map((code) => (
            <Pressable
              key={code}
              onPress={() => setLanguage(code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === code }}
              style={[
                styles.language,
                {
                  borderColor: language === code ? theme.tint : theme.border,
                  backgroundColor: language === code ? theme.tintSoft : theme.background,
                },
              ]}>
              <ThemedText type="small">{LANGUAGE_NAMES[code]}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <Button title={t('home.voices')} variant="secondary" onPress={() => router.push('/voices')} />

      <View style={styles.section}>
        <ThemedText style={styles.title}>{t('settings.account')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t('home.loggedInAs', { email: session?.user.email ?? '' })}
        </ThemedText>
        {/* After sign-out the session becomes null and the root layout's
            guard sends us back to the sign-in screen. */}
        <Button title={t('home.signOut')} variant="secondary" onPress={() => supabase.auth.signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  title: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  language: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 2 },
});
