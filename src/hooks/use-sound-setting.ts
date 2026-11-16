import { useEffect, useState } from 'react';

import { getAutoplay, setAutoplay, stopSpeaking } from '@/lib/speech';

/**
 * The stored "sound" setting, shared by reviews, lessons and practice: when
 * on, text is read aloud automatically and answers get a sound effect.
 * `sound` is null until the stored value has been read.
 */
export function useSoundSetting(): { sound: boolean | null; toggleSound: () => void } {
  const [sound, setSound] = useState<boolean | null>(null);

  useEffect(() => {
    getAutoplay().then(setSound, () => setSound(true));
  }, []);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    setAutoplay(next);
    if (!next) stopSpeaking();
  }

  return { sound, toggleSound };
}
