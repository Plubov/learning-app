import type { ListenHandlers, Listening } from './speech-recognition';

export type { ListenHandlers, Listening } from './speech-recognition';

/**
 * Speech recognition in the browser (the Web Speech API). Chrome and Edge
 * send the audio to their own speech service, which is why it needs a
 * connection; the browser asks once for the microphone. Firefox has none.
 */

/** The part of the browser's SpeechRecognition the app uses (it is not in TypeScript's DOM types everywhere). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Region to ask for, as recognisers want a full locale. */
const LOCALES: Record<string, string> = { ko: 'ko-KR', de: 'de-DE', en: 'en-US', es: 'es-ES' };

function recognitionClass(): (new () => Recognition) | null {
  const scope = globalThis as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionClass() !== null;
}

export function startListening(lang: string, handlers: ListenHandlers): Listening | null {
  const Class = recognitionClass();
  if (!Class) return null;
  const recognition = new Class();
  recognition.lang = LOCALES[lang] ?? lang;
  recognition.interimResults = false;
  recognition.continuous = false;
  // Several guesses: the right answer is often not the first one.
  recognition.maxAlternatives = 5;
  recognition.onresult = (event) => {
    const first = event.results[0];
    const alternatives: string[] = [];
    for (let i = 0; first && i < first.length; i++) alternatives.push(first[i].transcript);
    handlers.onResult(alternatives.filter((text) => text.trim() !== ''));
  };
  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') handlers.onError('denied');
    else if (event.error === 'no-speech') handlers.onError('silence');
    else if (event.error !== 'aborted') handlers.onError('other');
  };
  recognition.onend = () => handlers.onEnd();
  try {
    recognition.start();
  } catch {
    return null; // already listening, or not allowed here
  }
  return { stop: () => recognition.stop() };
}
