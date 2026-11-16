import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

import { pickVoice, targetSpeech } from '@/lib/speech-text';

/**
 * Text-to-speech with the voices built into the device or browser
 * (expo-speech). No network service and no cost; the voice quality depends on
 * the device. Android uses Google's speech engine, iOS/iPad Apple's voices,
 * the browser its own (Chrome and Edge offer Korean voices).
 *
 * Which voice speaks a language: the one the learner chose on the voices
 * screen, otherwise one the app picks (see pickVoice). A device usually has
 * several voices per language, and their names do not say whether they are
 * male or female, so the choice is the learner's.
 */

/** Region to ask for when only the language is known. */
const LOCALES: Record<string, string> = { ko: 'ko-KR' };
/** The language being learned is read a little slower. */
const SLOW_RATE = 0.9;
/**
 * The learner's own language is read slightly faster and higher, which
 * makes the built-in voices sound livelier. (Device voices have no "mood"
 * setting; speed and pitch are all that can be changed.)
 */
const LIVELY = { rate: 1.05, pitch: 1.12 };
/** For study (university) courses: a little slower and lower, for concentrated reading. */
const CALM = { rate: 0.93, pitch: 0.95 };

const VOICE_KEY = (lang: string) => `speech_voice_${lang}`;

export type VoiceOption = { identifier: string; name: string; enhanced: boolean };

/** The device's voices, loaded once. Browsers load their list late, so an empty list is asked for again. */
let voiceList: Promise<Speech.Voice[]> | null = null;

function allVoices(): Promise<Speech.Voice[]> {
  voiceList ??= Speech.getAvailableVoicesAsync().then(
    (voices) => {
      if (voices.length === 0) voiceList = null;
      return voices;
    },
    () => {
      voiceList = null;
      return [];
    },
  );
  return voiceList;
}

/** The voices of one language ('ko', 'en', ...), better quality first. */
export async function voicesFor(lang: string): Promise<VoiceOption[]> {
  const code = lang.toLowerCase();
  return (await allVoices())
    .filter((voice) => {
      const language = voice.language.replace('_', '-').toLowerCase();
      return language === code || language.startsWith(`${code}-`);
    })
    .map((voice) => ({
      identifier: voice.identifier,
      name: voice.name || voice.identifier,
      enhanced: voice.quality === Speech.VoiceQuality.Enhanced,
    }))
    .sort((a, b) => Number(b.enhanced) - Number(a.enhanced) || a.name.localeCompare(b.name));
}

/** The voice the learner chose for a language, or null for "automatic". */
export async function getChosenVoice(lang: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(VOICE_KEY(lang));
  } catch {
    return null;
  }
}

/** Stores the voice for a language; null goes back to "automatic". */
export async function setChosenVoice(lang: string, identifier: string | null): Promise<void> {
  if (identifier === null) await AsyncStorage.removeItem(VOICE_KEY(lang));
  else await AsyncStorage.setItem(VOICE_KEY(lang), identifier);
}

/** The voice that speaks a language: the chosen one if the device still has it, else the app's pick. */
async function voiceFor(lang: string): Promise<string | null> {
  const voices = await allVoices();
  const chosen = await getChosenVoice(lang);
  if (chosen && voices.some((voice) => voice.identifier === chosen)) return chosen;
  return pickVoice(voices, lang);
}

export type SpokenSegment = {
  text: string;
  lang: string;
  /** Text in the language being learned. */
  slow?: boolean;
  /** The calm voice instead of the lively one (study courses). */
  calm?: boolean;
  /** This voice instead of the language's usual one (for trying a voice). */
  voice?: string;
};

/**
 * Reads stretches of text aloud one after the other, each with a voice for
 * its language, interrupting anything still being spoken. This is how a
 * sentence that mixes two languages is read: expo-speech queues each
 * `speak` call behind the previous one.
 */
export async function speakSegments(segments: readonly SpokenSegment[]): Promise<void> {
  const spoken = segments.filter((segment) => segment.text !== '');
  if (spoken.length === 0) return;
  const voices = await Promise.all(
    spoken.map((segment) => segment.voice ?? voiceFor(segment.lang)),
  );
  await Speech.stop();
  spoken.forEach((segment, i) => {
    const voice = voices[i];
    // Without a known voice, the language alone lets the system choose one.
    Speech.speak(segment.text, {
      language: LOCALES[segment.lang] ?? segment.lang,
      ...(voice && { voice }),
      ...(segment.slow ? { rate: SLOW_RATE } : segment.calm ? CALM : LIVELY),
    });
  });
}

/** Reads the Korean of a text aloud (nothing else in it), interrupting anything still being spoken. */
export function speakKorean(term: string): Promise<void> {
  return speakSegments([{ text: targetSpeech(term, 'ko'), lang: 'ko', slow: true }]);
}

export function stopSpeaking(): Promise<void> {
  return Speech.stop();
}

const AUTOPLAY_KEY = 'speech_autoplay';

/** Whether text is read aloud automatically in reviews and lessons (default on). */
export async function getAutoplay(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTOPLAY_KEY)) !== 'off';
}

export function setAutoplay(on: boolean): Promise<void> {
  return AsyncStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off');
}
