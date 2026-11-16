/**
 * Writes the app's three sound effects as small WAV files into
 * assets/sounds/. They are made from sine waves here, so the app needs no
 * sound files from anywhere else (no licences to track).
 *
 * Run again after changing a sound: node scripts/make-sounds.js
 */
const fs = require('fs');
const path = require('path');

const RATE = 44100;

/**
 * One bell-like note: a sine with two quieter overtones that fades out.
 * @returns samples in -1..1, `seconds` long
 */
function note(frequency, seconds, volume = 1) {
  const samples = new Float64Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.005); // 5 ms fade-in avoids a click
    const decay = Math.exp((-5 * t) / seconds);
    const wave =
      Math.sin(2 * Math.PI * frequency * t) +
      0.3 * Math.sin(2 * Math.PI * frequency * 2 * t) +
      0.1 * Math.sin(2 * Math.PI * frequency * 3 * t);
    samples[i] = (wave / 1.4) * attack * decay * volume;
  }
  return samples;
}

/** Mixes notes into one sound; each entry is [start in seconds, samples]. */
function mix(entries) {
  const length = Math.max(...entries.map(([start, samples]) => Math.round(start * RATE) + samples.length));
  const out = new Float64Array(length);
  for (const [start, samples] of entries) {
    const offset = Math.round(start * RATE);
    for (let i = 0; i < samples.length; i++) out[offset + i] += samples[i];
  }
  return out;
}

/** 16-bit mono WAV file contents. */
function wav(samples) {
  const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0) || 1;
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round((samples[i] / peak) * 0.6 * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); // size of the format block
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per sample
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Note frequencies in hertz.
const E4 = 329.63;
const G4 = 392.0;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const sounds = {
  // Two quick rising notes.
  correct: mix([
    [0, note(E5, 0.18)],
    [0.09, note(C6, 0.35)],
  ]),
  // Two soft falling notes, lower and quieter: a nudge, not a punishment.
  wrong: mix([
    [0, note(G4, 0.2, 0.8)],
    [0.12, note(E4, 0.35, 0.8)],
  ]),
  // A rising chord for the end of a session.
  complete: mix([
    [0, note(C5, 0.25)],
    [0.11, note(E5, 0.25)],
    [0.22, note(G5, 0.25)],
    [0.33, note(C6, 0.8)],
    [0.33, note(E5, 0.8, 0.5)],
  ]),
};

const folder = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(folder, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  const file = path.join(folder, `${name}.wav`);
  fs.writeFileSync(file, wav(samples));
  console.log(`${file}: ${(samples.length / RATE).toFixed(2)} s`);
}
