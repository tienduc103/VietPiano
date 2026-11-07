import { describe, expect, it } from 'vitest';
import { referenceFromLesson } from '../reference/fromLesson';
import { testLesson } from '../testing/lessons';
import { synthPerformance } from '../testing/synth';
import { alignPerformance, clusterOnsets, dtwPath, pitchSimilarity } from './align';
import { monotonicAnchors, TempoMap, theilSenSlope } from './tempoMap';

const MELODY = 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4';
const kinds = (a: ReturnType<typeof alignPerformance>) => [...a.pairs.values()].map((p) => p.kind);

describe('tiện ích căn chỉnh', () => {
  it('độ giống tập cao độ: đúng phím 1, khác quãng 0.5, gần 0.25', () => {
    expect(pitchSimilarity([60], [60])).toBe(1);
    expect(pitchSimilarity([60], [72])).toBe(0.5);
    expect(pitchSimilarity([60], [62])).toBe(0.25);
    expect(pitchSimilarity([60], [67])).toBe(0);
    expect(pitchSimilarity([60, 64, 67], [60, 64, 67])).toBe(1);
    expect(pitchSimilarity([60, 64, 67], [60, 67])).toBeCloseTo(0.8);
  });

  it('gom cụm onset theo cửa sổ tính từ đầu cụm', () => {
    expect(clusterOnsets([0, 20, 45, 200, 230, 600], 50)).toEqual([[0, 1, 2], [3, 4], [5]]);
  });

  it('DTW đi chéo khi khớp, bước ngang cho phần tử thừa', () => {
    const a = [1, 2, 3];
    const b = [1, 9, 2, 3];
    const path = dtwPath((i, j) => (a[i] === b[j] ? 0 : 1), a.length, b.length);
    expect(path).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('bản đồ tempo: nội suy, ngoại suy, nghịch đảo, độ dài phách', () => {
    const m = new TempoMap(
      [
        [0, 1000],
        [4, 5000],
        [8, 7000],
      ],
      1000,
    );
    expect(m.msAt(2)).toBe(3000);
    expect(m.msAt(10)).toBe(8000);
    expect(m.msAt(-1)).toBe(0);
    expect(m.beatAt(6000)).toBe(6);
    expect(m.msPerBeatAt(6)).toBe(500);
    expect(m.msPerBeatAt(4)).toBe(750);
    expect(new TempoMap([], 500, [0, 100]).msAt(2)).toBe(1100);
  });

  it('mốc neo: bỏ mốc làm bản đồ đi lùi', () => {
    const out = monotonicAnchors([
      { beat: 0, ms: 0 },
      { beat: 1, ms: 1000 },
      { beat: 2, ms: 5000 },
      { beat: 3, ms: 3000 },
      { beat: 4, ms: 4000 },
    ]);
    expect(out.map((a) => a.beat)).toEqual([0, 1, 3, 4]);
  });

  it('Theil–Sen bền với điểm lệch', () => {
    expect(theilSenSlope([0, 1, 2, 3, 4], [0, 10, 20, 300, 40])).toBe(10);
  });
});

describe('alignPerformance', () => {
  const ref = referenceFromLesson(testLesson(MELODY));

  it('chơi đúng ở tempo mục tiêu: mọi nốt khớp đúng phím', () => {
    const a = alignPerformance(ref, synthPerformance(ref, { jitterMs: 25 }));
    expect(a.missing).toEqual([]);
    expect(a.extras).toEqual([]);
    expect(kinds(a).every((k) => k === 'exact')).toBe(true);
    expect(a.anchoredRatio).toBe(1);
  });

  it.each([
    ['nhanh hơn 50%', 90],
    ['chậm hơn 40%', 36],
  ])('chơi %s tempo mục tiêu vẫn khớp hết', (_, bpm) => {
    const a = alignPerformance(ref, synthPerformance(ref, { bpm, jitterMs: 20 }));
    expect(a.missing).toEqual([]);
    expect(a.extras).toEqual([]);
  });

  it('nhanh dần (accelerando) và ngắt 3 giây giữa bài vẫn khớp hết', () => {
    const msAtBeat = (b: number) => 1000 + 1000 * b - 25 * b * b; // 60 → ~150 bpm
    const a = alignPerformance(ref, synthPerformance(ref, { msAtBeat, gaps: [{ beat: 8, ms: 3000 }] }));
    expect(a.missing).toEqual([]);
    expect(a.extras).toEqual([]);
  });

  it('bỏ nốt + nốt thừa + sai nốt + sai quãng tám được tách đúng', () => {
    const perf = synthPerformance(ref, {
      mods: { 'm:2': { skip: true }, 'm:5': { midi: 70 }, 'm:9': { midi: 59 + 24 } },
      extras: [{ midi: 50, beat: 12.5 }],
      jitterMs: 15,
    });
    const a = alignPerformance(ref, perf);
    const idx = (id: string) => ref.notes.findIndex((n) => n.id === id);
    expect(a.missing).toEqual([idx('m:2')]);
    expect(a.pairs.get(idx('m:5'))?.kind).toBe('wrong');
    expect(a.pairs.get(idx('m:9'))?.kind).toBe('octave');
    expect(a.extras.map((i) => perf.notes[i].midi)).toEqual([50]);
  });

  it('chỉ chơi nửa đầu: nửa sau thiếu, không có nốt thừa', () => {
    const half = Object.fromEntries(ref.notes.filter((n) => n.onsetBeat >= 8).map((n) => [n.id, { skip: true }]));
    const a = alignPerformance(ref, synthPerformance(ref, { mods: half }));
    expect(a.missing).toHaveLength(8);
    expect(a.extras).toEqual([]);
  });

  it('nốt lặp cùng cao độ: bỏ một nốt thì đúng nốt đó bị thiếu (không bắt chéo)', () => {
    const r = referenceFromLesson(testLesson('C4 C4 C4 C4 | D4 D4 E4 E4 | C4/w'));
    const a = alignPerformance(r, synthPerformance(r, { mods: { 'm:2': { skip: true } }, jitterMs: 20 }));
    expect(a.missing.map((i) => r.notes[i].id)).toEqual(['m:2']);
    expect(a.extras).toEqual([]);
    // Khác tempo mục tiêu: tempo ước lượng từ chính bản chơi.
    const b = alignPerformance(r, synthPerformance(r, { bpm: 84, mods: { 'm:1': { skip: true } }, jitterMs: 20 }));
    expect(b.missing.map((i) => r.notes[i].id)).toEqual(['m:1']);
    expect(b.extras).toEqual([]);
  });

  it('Twinkle (nhiều cặp nốt lặp), chậm hơn mục tiêu, bỏ một nốt lặp', () => {
    const r = referenceFromLesson(testLesson('C4 C4 G4 G4 | A4 A4 G4/h | F4 F4 E4 E4 | D4 D4 C4/h'));
    const a = alignPerformance(r, synthPerformance(r, { bpm: 48, mods: { 'm:8': { skip: true } }, jitterMs: 30 }));
    expect(a.missing.map((i) => r.notes[i].id)).toEqual(['m:8']);
    expect(a.extras).toEqual([]);
  });

  it('hai tay + hợp âm rải 40 ms, tay trái trễ 60 ms: vẫn khớp đúng phím', () => {
    const r = referenceFromLesson(testLesson('E4 G4 E4 G4 | F4 A4 G4/h', { acc: 'C3+E3+G3/h C3+E3+G3/h | F3+A3+C4/h G3+B3+D4/h' }));
    const a = alignPerformance(r, synthPerformance(r, { chordSpreadMs: 20, handOffsetMs: { left: 60 } }));
    expect(a.missing).toEqual([]);
    expect(a.extras).toEqual([]);
    expect(kinds(a).every((k) => k === 'exact')).toBe(true);
  });

  it('không có nốt nào → mọi nốt thiếu, độ tin cậy 0', () => {
    const a = alignPerformance(ref, synthPerformance(ref, { mods: Object.fromEntries(ref.notes.map((n) => [n.id, { skip: true }])) }));
    expect(a.missing).toHaveLength(ref.notes.length);
    expect(a.anchoredRatio).toBe(0);
  });

  it('chơi bài khác hẳn → độ tin cậy thấp', () => {
    const other = synthPerformance(referenceFromLesson(testLesson('F#5 G#5 A#5 C#6 | D#6 F#5 G#5/h | A#5 C#6 D#6 F#6 | G#6/w')));
    const a = alignPerformance(ref, other);
    expect(a.anchoredRatio).toBeLessThan(0.4);
  });
});
