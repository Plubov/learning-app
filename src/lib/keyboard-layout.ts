import AsyncStorage from '@react-native-async-storage/async-storage';

import { layoutForLanguage, type KeyboardLayout } from '@/lib/hangul';

const LAYOUT_KEY = 'keyboard_layout';

/**
 * The layout of the computer's keyboard, for Korean typing on the web.
 * Stored on this device only (it depends on the keyboard, not the learner);
 * until chosen, guessed from the browser's language.
 */
export async function getKeyboardLayout(): Promise<KeyboardLayout> {
  const stored = await AsyncStorage.getItem(LAYOUT_KEY);
  if (stored === 'qwerty' || stored === 'qwertz') return stored;
  return layoutForLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
}

export function setKeyboardLayout(layout: KeyboardLayout): Promise<void> {
  return AsyncStorage.setItem(LAYOUT_KEY, layout);
}
