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
