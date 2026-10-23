/**
 * Toàn chuỗi PitchDetector + AttackAnalyzer + NoteRecognizer trên tín hiệu tổng hợp
 * có đạp pedal (nốt trước còn ngân khi gõ nốt sau).
 */
import { describe, expect, it } from 'vitest';
import { PitchDetector } from './PitchDetector';
import { AttackAnalyzer } from './AttackAnalyzer';
import { NoteRecognizer } from './NoteRecognizer';
import { melody, pianoLike, type MelodyOptions } from './testSignals';
import { midiToFrequency, requireMidi } from '../music/notes';

const SR = 48000;
const N = 2048;
const HOP = 1024;

function recognize(signal: Float32Array, { useAttack = true, from = 0 } = {}): number[] {
  const detector = new PitchDetector({ sampleRate: SR, frameSize: N });
  const attack = new AttackAnalyzer({ sampleRate: SR, frameSize: N });
  const recognizer = new NoteRecognizer();
  const out: number[] = [];
  for (let s = 0; s + N <= signal.length; s += HOP) {
    const buffer = signal.subarray(s, s + N);
    const time = ((s + N) / SR) * 1000;
    const r = recognizer.process({
      ...detector.detect(buffer),
      time,
      attack: useAttack ? attack.process(buffer, time) : null,
    });
    if (r.noteOn && time >= from) out.push(r.noteOn.midi);
  }
  return out;
}

const notes = (s: string) => s.split(' ').map(requireMidi);
const VELOCITIES = [0.9, 0.75, 1, 0.8, 0.7, 0.95, 0.85, 0.65, 1, 0.8, 0.9, 0.7];

describe('NoteRecognizer + AttackAnalyzer: quãng cao tới C7', () => {
  it.each(['A6 B6 C7', 'E6 G6 A6 B6 C7 B6 A6', 'C6 A6 C6 B6'])('không pedal: %s', (seq) => {
    const midis = notes(seq);
    expect(recognize(melody(midis, SR, { decaySec: 0.6, velocities: VELOCITIES }))).toEqual(midis);
  });

  // Quãng cao của đàn thật: hoạ âm lệch mạnh, lên dây stretch, tắt nhanh.
  it.each(['C7 D7 E7 G7 C8', 'C8 B7 A7 G7 F7 E7 D7 C7', 'C6 C7 C6 C8', 'A6 C7 E7 A7'])('quãng cao tới C8: %s', (seq) => {
    const midis = notes(seq);
    for (const pedal of [false, true]) {
      for (const [inharmonicity, detuneCents] of [
        [0.002, 0],
        [0.006, 25],
      ]) {
        const signal = melody(midis, SR, { pedal, decaySec: 0.4, inharmonicity, detuneCents, velocities: VELOCITIES });
        expect(recognize(signal), `pedal=${pedal} B=${inharmonicity} +${detuneCents}c`).toEqual(midis);
      }
    }
  });

  it.each(['A6 B6 C7', 'G6 A6 B6 A6'])('pedal: %s', (seq) => {
    const midis = notes(seq);
    expect(recognize(melody(midis, SR, { pedal: true, decaySec: 0.6, velocities: VELOCITIES }))).toEqual(midis);
  });
});

describe('NoteRecognizer + AttackAnalyzer: nốt gõ đè lên âm ngân (pedal)', () => {
  it.each(['E4 D4', 'F4 E4 D4', 'A4 D4', 'D4 F4 A4', 'C4 D4 E4', 'A4 G4 F4 E4 D4'])('pedal: %s', (seq) => {
    const midis = notes(seq);
    const signal = melody(midis, SR, { pedal: true, velocities: VELOCITIES });
    expect(recognize(signal)).toEqual(midis);
  });

  it('pedal: 4 ô nhịp đầu Romance bản 2 (Rê thứ), có nốt lặp', () => {
    const midis = notes('A4 A4 A4 A4 G4 F4 F4 E4 D4 D4 F4 A4');
    // Nốt lặp chỉ được nhận khi lần gõ sau làm hoạ âm tăng ≥ noveltyRatio (1.6) lần so với phần
    // còn ngân — ngưỡng này để dao động biên độ của âm ngân không bị coi là gõ lại.
    // Tắt dần 0.8 s (piano thật tắt nhanh trong giây đầu) → đủ dù lực gõ không đều.
    const signal = melody(midis, SR, { pedal: true, decaySec: 0.8, velocities: VELOCITIES });
    expect(recognize(signal)).toEqual(midis);
  });

  it('pedal, ngân rất dài (1.5 s): nốt lặp có thể bị sót nhưng KHÔNG bao giờ nhảy sai nốt', () => {
    const midis = notes('A4 A4 A4 A4 G4 F4 F4 E4 D4 D4 F4 A4');
    const got = recognize(melody(midis, SR, { pedal: true, decaySec: 1.5, velocities: VELOCITIES }));
    // Mọi sự kiện là một dãy con theo đúng thứ tự của giai điệu (chỉ thiếu, không thừa/sai).
    let i = 0;
    for (const m of got) {
      while (i < midis.length && midis[i] !== m) i++;
      expect(i).toBeLessThan(midis.length);
      i++;
    }
    expect(got.length).toBeGreaterThanOrEqual(8);
  });

  it('trước khi có AttackAnalyzer, cùng tín hiệu pedal bị nhận sai (tài liệu hoá lỗi đã sửa)', () => {
    const midis = notes('F4 E4 D4');
    const signal = melody(midis, SR, { pedal: true, velocities: VELOCITIES });
    expect(recognize(signal, { useAttack: false })).not.toEqual(midis);
  });

  it.each<[string, MelodyOptions]>([
    ['C4 D4 E4 F4 G4 A4 B4 C5', { noteMs: 600 }],
    ['E4 E4 F4 G4 G4 F4 E4 D4', { noteMs: 600 }],
    ['C3 G3 C4 E4 G4', { noteMs: 500, decaySec: 3 }],
  ])('không pedal: kết quả giống hệt khi chỉ dùng YIN (%s)', (seq, opts) => {
    const signal = melody(notes(seq), SR, { ...opts, velocities: VELOCITIES });
    expect(recognize(signal)).toEqual(recognize(signal, { useAttack: false }));
  });

  it('giữ một nốt ngân 4 giây trên nền pedal chỉ tạo MỘT sự kiện', () => {
    const signal = melody(notes('F4 A4 D4'), SR, { pedal: true, noteMs: 600, decaySec: 4, tailMs: 4000 });
    expect(recognize(signal)).toEqual(notes('F4 A4 D4'));
  });

  it.each([
    [62, 6, 0.35],
    [62, 10, 0.35],
    [62, 6, 0.2],
    [69, 6, 0.35],
    [69, 10, 0.2],
  ])('âm ngân MIDI %i dao động %i Hz ±%f trên nền pedal: không phát thêm sự kiện', (midi, rate, depth) => {
    const len = SR * 4;
    const tone = pianoLike(midiToFrequency(midi), SR, len);
    const bg1 = pianoLike(midiToFrequency(midi + 3), SR, len + SR);
    const bg2 = pianoLike(midiToFrequency(midi + 7), SR, len + SR);
    const signal = new Float32Array(len + SR);
    for (let i = 0; i < len + SR; i++) {
      signal[i] = (0.5 * bg1[i] + 0.5 * bg2[i]) * Math.exp(-i / SR / 2);
    }
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      signal[SR + i] += tone[i] * Math.min(1, i / 240) * (1 + depth * Math.sin(2 * Math.PI * rate * t)) * Math.exp(-t / 2);
    }
    // Bỏ qua sự kiện của hợp âm nền lúc đầu; từ lúc gõ nốt chính chỉ được có đúng một sự kiện.
    expect(recognize(signal, { from: 1000 })).toEqual([midi]);
  });
});
