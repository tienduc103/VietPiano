import { describe, expect, it } from 'vitest';
import { PitchDetector } from './PitchDetector';
import { frequencyToNearestNote, midiToFrequency } from '../music/notes';
import { mix, noise, pianoLike, sine } from './testSignals';

const SR = 48000;
const N = 2048;

describe('PitchDetector (YIN)', () => {
  const detector = new PitchDetector({ sampleRate: SR, frameSize: N });

  it.each([48, 55, 60, 64, 67, 69, 72, 79, 84, 91])('nhận đúng sóng sin MIDI %i trong ±5 cents', (midi) => {
    const f = midiToFrequency(midi);
    const res = detector.detect(sine(f, SR, N));
    expect(res.frequency).not.toBeNull();
    const note = frequencyToNearestNote(res.frequency!)!;
    expect(note.midi).toBe(midi);
    expect(Math.abs(note.cents)).toBeLessThan(5);
    expect(res.confidence).toBeGreaterThan(0.9);
  });

  it.each([43, 48, 53, 60, 65, 72, 77, 84])('nhận đúng âm giống piano MIDI %i (có hoạ âm)', (midi) => {
    const res = detector.detect(pianoLike(midiToFrequency(midi), SR, N));
    expect(frequencyToNearestNote(res.frequency!)!.midi).toBe(midi);
  });

  // Quãng cao tới C7 (2093 Hz): trước đây maxFrequency = 1600 Hz → A6/B6 bị nhận thành quãng 8 dưới.
  it.each([88, 91, 93, 94, 95, 96])('quãng cao: nhận đúng sin + âm giống piano MIDI %i', (midi) => {
    const f = midiToFrequency(midi);
    for (const sig of [sine(f, SR, N), pianoLike(f, SR, N)]) {
      const note = frequencyToNearestNote(detector.detect(sig).frequency!)!;
      expect(note.midi).toBe(midi);
      expect(Math.abs(note.cents)).toBeLessThan(15);
    }
  });

  // Dây quãng cao lệch hoạ âm mạnh → chu kỳ YIN bị kéo cao (C7 đúng dây đo ra +22 cents);
  // cộng lên dây stretch (+25 cents) là vượt maxCentsDeviation. Cao độ phải lấy theo âm cơ bản.
  it.each([
    [48000, 96],
    [48000, 100],
    [48000, 103],
    [48000, 105],
    [48000, 108],
    [44100, 96],
    [44100, 101],
    [44100, 108],
  ])('quãng cao tới C8 (%i Hz, MIDI %i): hoạ âm lệch mạnh + stretch 25 cents', (sr, midi) => {
    const d = new PitchDetector({ sampleRate: sr, frameSize: N });
    for (const [inharmonicity, cents] of [
      [0.002, 0],
      [0.002, 25],
      [0.008, 25],
    ]) {
      const f = midiToFrequency(midi) * Math.pow(2, cents / 1200);
      const note = frequencyToNearestNote(d.detect(pianoLike(f, sr, N, { inharmonicity })).frequency!)!;
      expect(note.midi).toBe(midi);
      expect(Math.abs(note.cents - cents)).toBeLessThan(8);
    }
  });

  it('quãng cao ở 44.1 kHz (A6, B6, C7)', () => {
    const d = new PitchDetector({ sampleRate: 44100, frameSize: N });
    for (const midi of [93, 95, 96]) {
      expect(frequencyToNearestNote(d.detect(pianoLike(midiToFrequency(midi), 44100, N)).frequency!)!.midi).toBe(midi);
    }
  });

  it('nốt G5–D6 không bị nhận lên quãng 8 khi dải tìm mở rộng tới C7', () => {
    for (let midi = 79; midi <= 86; midi++) {
      const res = detector.detect(pianoLike(midiToFrequency(midi), SR, N, { fundamentalGain: 0.5 }));
      expect(frequencyToNearestNote(res.frequency!)!.midi).toBe(midi);
    }
  });

  it('nhận đúng nốt trầm có hoạ âm cơ bản yếu (không nhảy quãng 8)', () => {
    for (const midi of [43, 45, 48, 50]) {
      const res = detector.detect(pianoLike(midiToFrequency(midi), SR, N, { fundamentalGain: 0.35 }));
      expect(frequencyToNearestNote(res.frequency!)!.midi).toBe(midi);
    }
  });

  it('chịu được nhiễu nền vừa phải', () => {
    const sig = mix(pianoLike(midiToFrequency(64), SR, N, { amplitude: 0.3 }), noise(N, 0.03));
    expect(frequencyToNearestNote(detector.detect(sig).frequency!)!.midi).toBe(64);
  });

  it('trả về null cho nhiễu trắng', () => {
    const res = detector.detect(noise(N, 0.2, 42));
    expect(res.frequency).toBeNull();
    expect(res.rms).toBeGreaterThan(0.05);
  });

  it('trả về null cho im lặng', () => {
    const res = detector.detect(new Float32Array(N));
    expect(res.frequency).toBeNull();
    expect(res.rms).toBe(0);
  });

  it('hoạt động với sample rate 44.1 kHz', () => {
    const d = new PitchDetector({ sampleRate: 44100, frameSize: N });
    const res = d.detect(pianoLike(midiToFrequency(57), 44100, N));
    expect(frequencyToNearestNote(res.frequency!)!.midi).toBe(57);
  });
});
