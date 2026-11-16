/**
 * Looking up the app's texts. Pure functions (no device access), so they can
 * be tested; the stored choice and the React part are in index.tsx.
 */
import { APP_LANGUAGES, type AppLanguage } from '../../../supabase/functions/_shared/course-schemas';
import { de } from './de';
import { en, type TextKey } from './en';
import { es } from './es';
import { ko } from './ko';

export { APP_LANGUAGES, type AppLanguage, type TextKey };

const TEXTS: Record<AppLanguage, Record<TextKey, string>> = { en, de, es, ko };

/** Each language under its own name, for the language switch. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  ko: '한국어',
};

/** The text for a key, with "{name}" places filled from `values`. */
export function translate(
  language: AppLanguage,
  key: TextKey,
  values?: Record<string, string | number>,
): string {
  const text = TEXTS[language][key];
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (place, name: string) =>
    name in values ? String(values[name]) : place,
  );
}

/** The app language for a device locale ("de-DE", "ko_KR"); English when it is not offered. */
export function languageForLocale(locale: string | null | undefined): AppLanguage {
  const code = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return APP_LANGUAGES.find((language) => language === code) ?? 'en';
}
