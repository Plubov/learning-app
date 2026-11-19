import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_LANGUAGES, LANGUAGE_NAMES, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** The app's settings, at the bottom of the Stats tab: voices, language, account. */
export function SettingsSection() {
  const theme = useTheme();
  const { t, language, setLanguage } = useT();
  const { session } = useSession();
  return (
    <View style={styles.section}>
      <ThemedText style={styles.title}>{t('settings.title')}</ThemedText>
      <Button title={t('home.voices')} variant="secondary" onPress={() => router.push('/voices')} />
      <View style={styles.languages}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('home.language')}
        </ThemedText>
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
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {t('home.loggedInAs', { email: session?.user.email ?? '' })}
      </ThemedText>
      {/* After sign-out the session becomes null and the root layout's
          guard sends us back to the sign-in screen. */}
      <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()} hitSlop={Spacing.two}>
        <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.underlined]}>
          {t('home.signOut')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.five, gap: Spacing.three },
  title: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  language: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 2 },
  center: { textAlign: 'center' },
  underlined: { textDecorationLine: 'underline' },
});
