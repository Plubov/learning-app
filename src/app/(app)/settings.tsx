import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSoundSetting } from '@/hooks/use-sound-setting';
import { useTheme } from '@/hooks/use-theme';
import { LAYOUT_NAMES, type KeyboardLayout } from '@/lib/hangul';
import { APP_LANGUAGES, LANGUAGE_NAMES, useT } from '@/lib/i18n';
import { getKeyboardLayout, setKeyboardLayout } from '@/lib/keyboard-layout';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const LAYOUTS = Object.keys(LAYOUT_NAMES) as KeyboardLayout[];

/**
 * Opened with the gear at the top left of every tab. Every setting of the
 * app is here: language, reading aloud, voices, the computer's keyboard
 * (web only) and the account. (Sessions keep their own quick sound switch.)
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const { t, language, setLanguage } = useT();
  const { sound, toggleSound } = useSoundSetting();
  const [layout, setLayout] = useState<KeyboardLayout | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') getKeyboardLayout().then(setLayout, () => setLayout('qwerty'));
  }, []);

  function chooseLayout(next: KeyboardLayout) {
    setLayout(next);
    setKeyboardLayout(next).catch(() => {});
  }

  /** A row of round choice buttons, the selected one highlighted. */
  const choices = <T extends string>(options: readonly T[], selected: T | null, label: (o: T) => string, pick: (o: T) => void): ReactNode => (
    <View style={styles.choices}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => pick(option)}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === option }}
          style={[
            styles.choice,
            {
              borderColor: selected === option ? theme.tint : theme.border,
              backgroundColor: selected === option ? theme.tintSoft : theme.background,
            },
          ]}>
          <ThemedText type="small">{label(option)}</ThemedText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen>
      <View style={styles.section}>
        <ThemedText style={styles.title}>{t('home.language')}</ThemedText>
        {choices(APP_LANGUAGES, language, (code) => LANGUAGE_NAMES[code], setLanguage)}
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <ThemedText style={[styles.title, styles.grow]}>{t('settings.sound')}</ThemedText>
          {sound !== null && (
            <Switch
              value={sound}
              onValueChange={toggleSound}
              trackColor={{ true: theme.tint }}
              accessibilityLabel={t('settings.sound')}
            />
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.soundHint')}
        </ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.title}>{t('settings.voices')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.voicesHint')}
        </ThemedText>
        <Button title={t('home.voices')} variant="secondary" onPress={() => router.push('/voices')} />
      </View>

      {Platform.OS === 'web' && (
        <View style={styles.section}>
          <ThemedText style={styles.title}>{t('settings.keyboard')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('settings.keyboardHint')}
          </ThemedText>
          {choices(LAYOUTS, layout, (option) => t(`kbd.${option}`), chooseLayout)}
        </View>
      )}

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
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 2 },
});
