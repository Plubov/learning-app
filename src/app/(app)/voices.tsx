import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_LANGUAGES, LANGUAGE_NAMES, useT, type AppLanguage } from '@/lib/i18n';
import {
  getChosenVoice,
  onVoicesChanged,
  setChosenVoice,
  speakSegments,
  stopSpeaking,
  voicesFor,
  type VoiceOption,
} from '@/lib/speech';
import { supabase } from '@/lib/supabase';

/** What each voice says when it is tried. */
const SAMPLES: Record<string, string> = {
  ko: '안녕하세요. 만나서 반가워요. 오늘도 같이 공부해요.',
  en: 'Hello! This is how I sound. Shall we learn something new?',
  de: 'Hallo! So klinge ich. Lernen wir heute etwas Neues?',
  es: '¡Hola! Así sueno yo. ¿Aprendemos algo nuevo hoy?',
};

const OTHER_NAMES: Record<string, string> = { ko: '한국어', en: 'English', de: 'Deutsch', es: 'Español' };

type LanguageVoices = {
  lang: string;
  voices: VoiceOption[];
  chosen: string | null;
  /** A language being learned in some deck: read slower, as in lessons. */
  learned: boolean;
};

/**
 * Choosing the voice per language: the languages being learned (Korean),
 * the app's language and the other languages lessons can be written in.
 * Natural-sounding voices come first and are marked. Tapping a voice plays
 * a sample with it, at the speed lessons use, and makes it the voice for
 * that language from then on.
 */
export default function VoicesScreen() {
  const theme = useTheme();
  const { t, language } = useT();
  const [groups, setGroups] = useState<LanguageVoices[] | null>(null);
  // Increased when the browser reports more voices (its natural online ones arrive late).
  const [voiceVersion, setVoiceVersion] = useState(0);

  useEffect(() => onVoicesChanged(() => setVoiceVersion((n) => n + 1)), []);

  useEffect(() => {
    let active = true;
    (async () => {
      const decks = await supabase.from('decks').select('target_lang');
      const learned = (decks.data ?? [])
        .map((deck) => deck.target_lang)
        .filter((lang): lang is string => !!lang);
      // The languages being learned first, then the app's language, then the
      // other languages lessons can be written in (a lesson keeps the
      // language it was written in, even after the app's language changes).
      const langs = [...new Set([...learned, language, ...APP_LANGUAGES])];
      const loaded = await Promise.all(
        langs.map(async (lang) => ({
          lang,
          voices: await voicesFor(lang),
          chosen: await getChosenVoice(lang),
          learned: learned.includes(lang),
        })),
      );
      if (active) setGroups(loaded);
    })().catch(() => {
      if (active) setGroups([]);
    });
    return () => {
      active = false;
    };
  }, [language, voiceVersion]);

  useEffect(
    () => () => {
      stopSpeaking(); // no voice after leaving the screen
    },
    [],
  );

  async function choose(lang: string, identifier: string | null, learned: boolean) {
    await setChosenVoice(lang, identifier).catch(() => {});
    setGroups((current) =>
      current?.map((group) => (group.lang === lang ? { ...group, chosen: identifier } : group)) ?? null,
    );
    speakSegments([
      {
        text: SAMPLES[lang] ?? SAMPLES.en,
        lang,
        // The sample sounds exactly as lessons will: a language being learned
        // slower, the others at the usual, slightly brisker speed.
        slow: learned,
        ...(identifier && { voice: identifier }),
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('voices.title') }} />
      <ThemedText themeColor="textSecondary">{t('voices.intro')}</ThemedText>
      {groups === null && <ThemedText themeColor="textSecondary">{t('voices.loading')}</ThemedText>}

      {groups?.map((group) => (
        <View key={group.lang} style={styles.group}>
          <ThemedText style={styles.groupTitle}>
            {LANGUAGE_NAMES[group.lang as AppLanguage] ?? OTHER_NAMES[group.lang] ?? group.lang}
          </ThemedText>
          {group.voices.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('voices.none')}
            </ThemedText>
          ) : (
            <>
              {!group.voices.some((voice) => voice.natural) && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t(Platform.OS === 'web' ? 'voices.noNaturalWeb' : 'voices.noNaturalPhone')}
                </ThemedText>
              )}
              {[{ identifier: null, name: t('voices.auto'), natural: false }, ...group.voices].map(
                (voice) => {
                  const selected = group.chosen === voice.identifier;
                  return (
                    <Pressable
                      key={voice.identifier ?? 'auto'}
                      onPress={() => choose(group.lang, voice.identifier, group.learned)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}>
                      <ThemedView
                        type={selected ? 'tintSoft' : 'backgroundElement'}
                        style={[styles.voice, { borderColor: selected ? theme.tint : 'transparent' }]}>
                        <ThemedText style={styles.grow} numberOfLines={2}>
                          {selected ? '✓ ' : ''}
                          {voice.name}
                        </ThemedText>
                        {voice.natural && (
                          <ThemedText type="small" style={[styles.badge, { color: theme.tint }]}>
                            ✨ {t('voices.natural')}
                          </ThemedText>
                        )}
                        <ThemedText style={styles.play}>▶</ThemedText>
                      </ThemedView>
                    </Pressable>
                  );
                },
              )}
            </>
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  group: { gap: Spacing.two },
  groupTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700, marginTop: Spacing.two },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  play: { fontSize: 16, lineHeight: 24 },
  badge: { fontWeight: 600 },
});
