import { describe, expect, it } from 'vitest';
import {
  frequencyToNearestNote,
  isBlackKey,
  midiToFrequency,
  pitchToLabel,
  midiToLabel,
  midiToName,
  nameToMidi,
} from './notes';

describe('chuyển đổi tần số ↔ nốt', () => {
  it('A4 = 440 Hz = MIDI 69', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(frequencyToNearestNote(440)).toEqual({ midi: 69, cents: 0 });
  });

  it('C4 (Đô giữa) ≈ 261.63 Hz = MIDI 60', () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(frequencyToNearestNote(261.63)?.midi).toBe(60);
  });

  it('tính cents lệch so với nốt gần nhất', () => {
    // Cao hơn A4 đúng 10 cents
    const f = 440 * Math.pow(2, 10 / 1200);
    expect(frequencyToNearestNote(f)).toEqual({ midi: 69, cents: 10 });
    // Thấp hơn A4 20 cents
    const g = 440 * Math.pow(2, -20 / 1200);
    expect(frequencyToNearestNote(g)).toEqual({ midi: 69, cents: -20 });
  });

  it('làm tròn sang nốt kề khi lệch hơn 50 cents', () => {
    const f = 440 * Math.pow(2, 60 / 1200);
    expect(frequencyToNearestNote(f)).toEqual({ midi: 70, cents: -40 });
  });

  it('hỗ trợ chỉnh A4 khác 440', () => {
    expect(frequencyToNearestNote(442, 442)).toEqual({ midi: 69, cents: 0 });
    expect(frequencyToNearestNote(440, 442)?.cents).toBeCloseTo(-7.9, 1);
  });

  it('trả về null với tần số không hợp lệ', () => {
    expect(frequencyToNearestNote(0)).toBeNull();
    expect(frequencyToNearestNote(-5)).toBeNull();
    expect(frequencyToNearestNote(Number.NaN)).toBeNull();
  });

  it('đổi qua lại giữa tên nốt và MIDI', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(61)).toBe('C#4');
    expect(midiToName(21)).toBe('A0');
    expect(midiToName(108)).toBe('C8');
    expect(nameToMidi('C4')).toBe(60);
    expect(nameToMidi('F#3')).toBe(54);
    expect(nameToMidi('Bb2')).toBe(46);
    expect(nameToMidi('c5')).toBe(72);
    expect(nameToMidi('H4')).toBeNull();
    for (let m = 21; m <= 108; m++) expect(nameToMidi(midiToName(m))).toBe(m);
  });

  it('tên solfege tiếng Việt', () => {
    expect(midiToLabel(60, 'solfege')).toBe('Đô4');
    expect(midiToLabel(67, 'solfege')).toBe('Sol4');
    expect(midiToLabel(59, 'solfege')).toBe('Si3');
  });

  it('nhận biết phím đen', () => {
    expect(isBlackKey(60)).toBe(false);
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(70)).toBe(true);
    expect(isBlackKey(71)).toBe(false);
  });
});

describe('pitchToLabel', () => {
  it('giữ đúng dấu hoá như cách viết trong bài', () => {
    expect(pitchToLabel('Bb4', 'letter')).toBe('B♭4');
    expect(pitchToLabel('Bb4', 'solfege')).toBe('Si♭4');
    expect(pitchToLabel('C#5', 'letter')).toBe('C#5');
    expect(pitchToLabel('C#5', 'solfege')).toBe('Đô#5');
    expect(pitchToLabel('D4', 'solfege')).toBe('Rê4');
    // Nốt không dấu hoá trùng với tên theo MIDI.
    expect(pitchToLabel('A4', 'letter')).toBe(midiToLabel(69, 'letter'));
    expect(() => pitchToLabel('H4', 'letter')).toThrow();
  });
});
