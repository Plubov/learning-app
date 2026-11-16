import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import {
  APP_LANGUAGES,
  languageForLocale,
  translate,
  type AppLanguage,
  type TextKey,
} from '@/lib/i18n/translate';

export { APP_LANGUAGES, LANGUAGE_NAMES, type AppLanguage, type TextKey } from '@/lib/i18n/translate';

/**
 * The app's language. The choice is stored on the device; until the learner
 * chooses, the device's language is used when the app offers it, otherwise
 * English. Screens get their texts with `useT()`:
 *
 *   const { t } = useT();
 *   <Button title={t('common.continue')} />
 *
 * The texts are in en.ts (the list of all keys), de.ts, es.ts and ko.ts.
 */

const STORAGE_KEY = 'app_language';

function deviceLanguage(): AppLanguage {
  try {
    return languageForLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

// Also kept outside React, for code that is not a component (the AI calls
// send the language along, so lessons are written in it).
let current: AppLanguage = deviceLanguage();

export function getLanguage(): AppLanguage {
  return current;
}

type LanguageState = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TextKey, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(current);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(
      (stored) => {
        const known = APP_LANGUAGES.find((code) => code === stored);
        if (known) {
          current = known;
          setLanguageState(known);
        }
      },
      () => {}, // no stored choice can be read: the device language stays
    );
  }, []);

  function setLanguage(next: AppLanguage) {
    current = next;
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  const state: LanguageState = {
    language,
    setLanguage,
    t: (key, values) => translate(language, key, values),
  };
  return <LanguageContext value={state}>{children}</LanguageContext>;
}

export function useT(): LanguageState {
  const state = use(LanguageContext);
  if (!state) throw new Error('useT must be used inside LanguageProvider');
  return state;
}
