import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/** Whether the app is in front: on a phone not in the background, on the web the tab visible and focused. */
function isActiveNow(): boolean {
  if (AppState.currentState !== 'active') return false;
  if (Platform.OS === 'web' && typeof document !== 'undefined') return document.hasFocus();
  return true;
}

/**
 * True while the learner is looking at the app. On a phone it turns false
 * when another app comes to the front. On the web it turns false when the
 * tab is hidden (another tab) and also when the window loses focus (another
 * program in front, while the tab stays visible).
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(isActiveNow);

  useEffect(() => {
    const update = () => setActive(isActiveNow());
    const subscription = AppState.addEventListener('change', update);
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) {
      window.addEventListener('focus', update);
      window.addEventListener('blur', update);
    }
    return () => {
      subscription?.remove();
      if (web) {
        window.removeEventListener('focus', update);
        window.removeEventListener('blur', update);
      }
    };
  }, []);

  return active;
}
