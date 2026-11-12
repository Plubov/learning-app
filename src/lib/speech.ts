import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

import { pickKoreanVoice, textForSpeech } from '@/lib/speech-text';

/**
 * Korean text-to-speech with the voices built into the device or browser
 * (expo-speech). No network service and no cost; the voice quality depends on
 * the device. Android uses Google's speech engine, iOS/iPad Apple's voices,
 * the browser its own (Chrome and Edge offer Korean voices).
 */

const LANGUAGE = 'ko-KR';

let voicePromise: Promise<string | null> | null = null;

function koreanVoice(): Promise<string | null> {
  voicePromise ??= Speech.getAvailableVoicesAsync().then(
    (voices) => {
      const voice = pickKoreanVoice(voices);
      // Browsers load their voice list late; ask again next time.
      if (voice === null) voicePromise = null;
      return voice;
    },
    () => {
      voicePromise = null;
      return null;
    },
  );
  return voicePromise;
}

/** Reads Korean text aloud, interrupting anything still being spoken. */
export async function speakKorean(term: string): Promise<void> {
  const text = textForSpeech(term);
  if (text === '') return;
  const voice = await koreanVoice();
  await Speech.stop();
  // Without a known voice, the language alone lets the system choose one.
  Speech.speak(text, { language: LANGUAGE, ...(voice && { voice }), rate: 0.9 });
}

export function stopSpeaking(): Promise<void> {
  return Speech.stop();
}

const AUTOPLAY_KEY = 'speech_autoplay';

/** Whether Korean is read aloud automatically during review (default on). */
export async function getAutoplay(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTOPLAY_KEY)) !== 'off';
}

export function setAutoplay(on: boolean): Promise<void> {
  return AsyncStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off');
}
