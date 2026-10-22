import { describe, expect, it } from 'vitest';
import { AttackAnalyzer, type AttackFrame } from './AttackAnalyzer';
import { melody, pianoLike } from './testSignals';
import { frequencyToNearestNote, midiToFrequency, requireMidi } from '../music/notes';

const SR = 48000;
const N = 2048;
const HOP = 1024;

function analyze(signal: Float32Array, analyzer = new AttackAnalyzer({ sampleRate: SR, frameSize: N })) {
  const frames: (AttackFrame & { time: number })[] = [];
  for (let s = 0; s + N <= signal.length; s += HOP) {
    const time = ((s + N) / SR) * 1000;
    frames.push({ ...analyzer.process(signal.subarray(s, s + N), time), time });
  }
  return frames;
}

/** Tên các nốt attack báo được trong khoảng thời gian [from, to) (ms). */
function attackNotes(frames: ReturnType<typeof analyze>, from: number, to: number): number[] {
  return frames
    .filter((f) => f.time >= from && f.time < to && f.frequency !== null)
    .map((f) => frequencyToNearestNote(f.frequency!)!.midi);
}

describe('AttackAnalyzer', () => {
  it('nốt gõ từ im lặng: có onset, âm nền ≈ 0, cao độ đúng', () => {
    // Im lặng phía trước để có lịch sử phổ
    const padded = new Float32Array(SR * 1.5);
    padded.set(melody([62], SR, { noteMs: 800 }), 4 * HOP);
    const frames = analyze(padded);
    // Chỉ xét lúc nốt còn kêu (đuôi gần như im lặng do NoteRecognizer chặn bằng noise gate)
    expect(frames.filter((f) => f.onset && f.time < 900)).toHaveLength(1);
    const notes = attackNotes(frames, 0, 900);
    expect(notes.length).toBeGreaterThan(5);
    expect(new Set(notes)).toEqual(new Set([62]));
    expect(Math.max(...frames.filter((f) => f.frequency !== null).map((f) => f.background))).toBeLessThan(0.1);
  });

  it.each([
    ['E4', 'D4'],
    ['A4', 'D4'], // YIN cho D3 với hỗn hợp này
    ['F4', 'D4'],
    ['D4', 'F4'], // YIN cho F2
    ['D4', 'A4'],
    ['G4', 'C5'],
  ])('pedal: %s còn ngân, gõ %s → nhận đúng nốt mới', (prev, next) => {
    const frames = analyze(melody([requireMidi(prev), requireMidi(next)], SR, { pedal: true, decaySec: 2 }));
    expect(frames.filter((f) => f.onset && f.time > 600)).toHaveLength(1);
    const notes = attackNotes(frames, 600, 1000);
    expect(notes.length).toBeGreaterThan(5);
    expect(new Set(notes)).toEqual(new Set([requireMidi(next)]));
    // Có âm nền: nốt trước vẫn ngân
    expect(frames.find((f) => f.frequency !== null && f.time > 600)!.background).toBeGreaterThan(0.2);
  });

  it('không báo cao độ ở chính khung onset (khung chỉ chứa một phần nốt)', () => {
    const frames = analyze(melody([64, 62], SR, { pedal: true }));
    for (const f of frames.filter((x) => x.onset)) expect(f.frequency).toBeNull();
  });

  it.each([
    [1.5, 0.2],
    [3, 0.2],
    [6, 0.2],
    [10, 0.2],
  ])('âm ngân dao động biên độ %f Hz ±%f (beating) trên nền pedal → không có onset', (rate, depth) => {
    const len = SR * 3;
    const tone = pianoLike(midiToFrequency(62), SR, len);
    const bg1 = pianoLike(midiToFrequency(65), SR, len);
    const bg2 = pianoLike(midiToFrequency(69), SR, len);
    const sig = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      sig[i] = (tone[i] * (1 + depth * Math.sin(2 * Math.PI * rate * t)) + 0.5 * bg1[i] + 0.5 * bg2[i]) * Math.exp(-t / 2);
    }
    const frames = analyze(sig).slice(4);
    expect(frames.filter((f) => f.onset)).toHaveLength(0);
    expect(frames.filter((f) => f.frequency !== null)).toHaveLength(0);
  });

  it('chỉ báo cao độ trong holdMs sau onset', () => {
    const frames = analyze(melody([64, 62], SR, { pedal: true, noteMs: 1000, decaySec: 3 }));
    const onset = frames.filter((f) => f.onset).at(-1)!.time;
    const late = frames.filter((f) => f.time > onset + 320 && f.frequency !== null);
    expect(late).toHaveLength(0);
  });

  it('reset() xoá lịch sử phổ', () => {
    const a = new AttackAnalyzer({ sampleRate: SR, frameSize: N });
    analyze(melody([64, 62], SR, { pedal: true }), a);
    a.reset();
    // Khung đầu sau reset: chưa đủ lịch sử → không thể có onset
    const sig = pianoLike(midiToFrequency(60), SR, N);
    expect(a.process(sig, 0).onset).toBe(false);
  });
});
