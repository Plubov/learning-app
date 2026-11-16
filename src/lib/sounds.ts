import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * The app's sound effects: short WAV files in assets/sounds/, made by
 * scripts/make-sounds.js. Played with expo-audio, Expo's library for playing
 * sound files (expo-speech can only speak text).
 */

export type SoundName = 'correct' | 'wrong' | 'complete';

// `require` of a sound file gives Metro's asset number, which expo-audio accepts.
const SOURCES: Record<SoundName, number> = {
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  complete: require('../../assets/sounds/complete.wav'),
};

// One player per sound, created on first use and then reused.
const players: Partial<Record<SoundName, AudioPlayer>> = {};

/** Plays a sound effect from its start. A sound that cannot be played is skipped. */
export function playSound(name: SoundName): void {
  try {
    const player = (players[name] ??= createAudioPlayer(SOURCES[name]));
    player.volume = 0.6;
    // Rewinding fails harmlessly while the file is still loading.
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Sound is decoration: never let it break a lesson.
  }
}
