/**
 * Speech recognition (speech to text) for conversations. Expo has no module
 * for it, and Expo Go cannot load one, so on phones and tablets it is not
 * available: conversations are answered by typing there. In the browser,
 * src/lib/speech-recognition.web.ts uses the browser's own recognition
 * (Chrome and Edge on computers and Android; Safari).
 *
 * Both files export the same functions; Metro picks the .web.ts one for the
 * web build.
 */

export type ListenHandlers = {
  /** What was heard: the recogniser's alternatives, most likely first. */
  onResult: (alternatives: string[]) => void;
  /** Listening stopped (after a result, an error or stop()). */
  onEnd: () => void;
  /** 'denied': the microphone is not allowed; 'silence': nothing was heard. */
  onError: (reason: 'denied' | 'silence' | 'other') => void;
};

export type Listening = { stop: () => void };

/** Whether this device can turn speech into text. */
export function canListen(): boolean {
  return false;
}

/** Starts listening for one answer in a language ('ko', ...); null when it cannot. */
export function startListening(_lang: string, _handlers: ListenHandlers): Listening | null {
  return null;
}
