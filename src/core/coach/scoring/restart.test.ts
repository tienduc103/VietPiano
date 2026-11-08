/**
 * M2-T11 — nhận biết "chơi lại" (dừng rồi quay về đầu câu / đầu ô / đầu bài): đoạn chơi lại không bị tính nốt thừa, mỗi nốt chấm
 * theo lần đầu chơi tới, mỗi lần chơi lại trừ như một chỗ ngắt quãng; bản chơi một mạch (kể cả có lỗi) không bao giờ bị cắt lượt.
 */
import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../lessons/library';
import { recommendPractice } from '../practice/recommend';
import { referenceFromLesson } from '../reference/fromLesson';
import { resultMap } from '../replay';
import { testLesson } from '../testing/lessons';
import { synthPerformance, type SynthOptions } from '../testing/synth';
import type { InputCapabilities, ScoreReference, ScoringResult } from '../types';
import { alignPerformance, dtwPath, splitAtJumps } from './align';
import { scorePerformance } from './ScoringEngine';

const MIDI_CAPS: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true };
const MIC_CAPS: InputCapabilities = { noteOff: false, velocity: false, relativeLevel: true, pedal: false, polyphonic: false };
const MELODY = 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4';
const D5 = 74;

function run(ref: ScoreReference, opts: SynthOptions = {}, caps = MIDI_CAPS): ScoringResult {
  return scorePerformance({ reference: ref, performance: synthPerformance(ref, { jitterMs: 12, ...opts }), session: { id: 's', profileKey: 'p', lessonId: ref.id }, capabilities: caps, now: 1 });
}
const of = (r: ScoringResult, type: string) => r.issues.filter((i) => i.type === type);
const continuity = (r: ScoringResult) => r.criteria.find((c) => c.key === 'rhythm')!.subScores.find((s) => s.key === 'continuity')!.value;
function expectTraceable(r: ScoringResult) {
  const lost = r.issues.reduce((a, i) => a + i.deduction, 0);
  expect(Math.abs(100 - lost - r.total)).toBeLessThanOrEqual(1);
}

describe('DTW có bước nhảy lùi', () => {
  it('đường đi nhảy về nhóm phía trước khi đoạn sau lặp lại ≥ 2 nhóm; không nhảy khi không có lợi', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1, 2, 3, 9, 2, 3, 4, 5];
    const cost = (i: number, j: number) => (a[i] === b[j] ? 0 : 1);
    const land = (i: number, j: number) => a[i] === b[j];
    const segs = splitAtJumps(dtwPath(cost, a.length, b.length, 0.3, 1.2, land));
    // Phần tử lạc (9) thuộc cuối lượt bị bỏ dở, lượt chơi lại bắt đầu bằng phần tử đúng.
    expect(segs.map((s) => s.map(([i]) => i))).toEqual([
      [0, 1, 2, 3],
      [1, 2, 3, 4],
    ]);
    // Một phần tử thừa trùng giá trị phía trước: bước ngang rẻ hơn bước nhảy.
    const c = [1, 2, 3, 2, 4, 5];
    expect(splitAtJumps(dtwPath((i, j) => (a[i] === c[j] ? 0 : 1), a.length, c.length, 0.3, 1.2, (i, j) => a[i] === c[j]))).toHaveLength(1);
    // Chơi hết rồi chơi thêm đoạn đầu: kết thúc mở → lượt cuối dừng ở giữa.
    const d = [1, 2, 3, 4, 5, 1, 2];
    expect(splitAtJumps(dtwPath((i, j) => (a[i] === d[j] ? 0 : 1), a.length, d.length, 0.3, 1.2, (i, j) => a[i] === d[j])).map((s) => s.map(([i]) => i))).toEqual([
      [0, 1, 2, 3, 4],
      [0, 1],
    ]);
    // Không cho nhảy (mặc định) = DTW thường.
    expect(splitAtJumps(dtwPath(cost, a.length, b.length))).toHaveLength(1);
  });
});

describe('alignPerformance — chơi lại', () => {
  const ref = referenceFromLesson(testLesson(MELODY));
  const idx = (id: string) => ref.notes.findIndex((n) => n.id === id);

  it('sai ở ô 2 rồi chơi lại từ đầu ô 2: hai lượt, nốt chơi lại không thành nốt thừa, nốt sai lần đầu vẫn được chấm', () => {
    const perf = synthPerformance(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5] }], jitterMs: 15 });
    const a = alignPerformance(ref, perf);
    expect(a.passes).toHaveLength(2);
    expect(a.restarts).toMatchObject([{ pass: 0, stopGroup: 7, restartGroup: 4, afterEnd: false }]);
    expect(a.restarts[0].slip.map((p) => perf.notes[p].midi)).toEqual([D5]);
    expect(a.extras).toEqual([]);
    expect(a.replayed.map((p) => perf.notes[p].midi)).toEqual([67, 69, 71, 72]);
    expect(a.missing).toEqual([]);
    expect(a.pairs.get(idx('m:7'))).toMatchObject({ kind: 'wrong' });
    // Nốt lượt đầu chấm ô 1–2, lượt chơi lại chấm từ nốt mới đầu tiên (ô 3).
    expect(a.refPass.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(a.refPass.slice(8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(a.passes[1].graded).toEqual([8, 15]);
    expect(a.anchoredRatio).toBeCloseTo(15 / 16, 6);
  });

  it('bài có câu lặp lại (A A B A) chơi một mạch, kể cả có nốt sai / thiếu / thừa: không bị cắt lượt', () => {
    const r = referenceFromLesson(testLesson('C4 D4 E4 F4 | C4 D4 E4 F4 | G4 A4 G4 F4 | C4 D4 E4 F4 | E4 D4 C4/h'));
    for (const opts of [{}, { mods: { 'm:5': { midi: 63 }, 'm:9': { skip: true } }, extras: [{ midi: 62, beat: 6.5 }, { midi: 64, beat: 13.5 }] }] as SynthOptions[]) {
      const a = alignPerformance(r, synthPerformance(r, { jitterMs: 20, ...opts }));
      expect(a.passes).toHaveLength(1);
      expect(a.replayed).toEqual([]);
    }
  });

  it('lùi đúng một nốt để sửa: không tính là chơi lại (như trước: nốt sai / thừa)', () => {
    const a = alignPerformance(ref, synthPerformance(ref, { restarts: [{ stopBeat: 7, fromBeat: 6, slip: [D5], gapMs: 400 }] }));
    expect(a.passes).toHaveLength(1);
    expect(a.restarts).toEqual([]);
  });
});

describe('scorePerformance — chơi lại', () => {
  const ref = referenceFromLesson(testLesson(MELODY));

  it('sai rồi chơi lại từ đầu ô 2: một lỗi sai nốt + một lỗi "chơi lại", không nốt thừa / ngắt quãng / trường độ giả', () => {
    const r = run(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5] }] });
    expect(of(r, 'extra-note')).toEqual([]);
    expect(of(r, 'hesitation')).toEqual([]);
    expect(r.issues.filter((i) => i.criterion === 'duration')).toEqual([]);
    expect(of(r, 'wrong-note')).toMatchObject([{ measure: 2, refNoteIds: ['m:7'], actualMidi: D5 }]);
    expect(of(r, 'restart')).toMatchObject([{ measure: 2, criterion: 'rhythm', refNoteIds: ['m:7'], message: 'Ô 2, phách 4: đánh D5 (cần C5) rồi dừng lại, chơi lại từ đầu ô 2.' }]);
    expect(r.counts).toMatchObject({ correct: 15, wrong: 1, missing: 0, extra: 0, repeated: 0, simultaneous: 0, replayed: 4, restarts: 1 });
    expect(continuity(r)).toBeCloseTo(0.66, 6);
    expect(r.alignment.filter((x) => x.status === 'replayed')).toHaveLength(4);
    expect(r.explanation.join(' ')).toContain('1 lần dừng lại rồi chơi lại');
    expect(r.passes).toHaveLength(2);
    expect(r.measures.find((m) => m.measure === 2)!.lost).toBeGreaterThan(0);
    expectTraceable(r);
  });

  it('vấp (không đánh sai) rồi chơi lại: chỉ một lỗi "chơi lại", chính xác nốt 100%', () => {
    const r = run(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, gapMs: 1500 }] });
    expect(r.issues.filter((i) => i.criterion !== 'dynamics').map((i) => i.type)).toEqual(['restart']);
    expect(of(r, 'restart')[0].message).toBe('Ô 2, phách 4: dừng lại trước C5, chơi lại từ đầu ô 2.');
    expect(r.criteria.find((c) => c.key === 'notes')!.value).toBe(1);
    expectTraceable(r);
  });

  it('chơi lại từ đầu bài / từ giữa ô / ngay không dừng / ở tempo khác mục tiêu', () => {
    const fromStart = run(ref, { restarts: [{ stopBeat: 10, fromBeat: 0, slip: [65] }] });
    expect(of(fromStart, 'restart')[0].message).toMatch(/chơi lại từ đầu bài\.$/);
    expect(of(fromStart, 'extra-note')).toEqual([]);
    expect(fromStart.counts.replayed).toBe(11);
    const midMeasure = run(ref, { restarts: [{ stopBeat: 7, fromBeat: 5 }] });
    expect(of(midMeasure, 'restart')[0].message).toBe('Ô 2, phách 4: dừng lại trước C5, chơi lại từ ô 2, phách 2.');
    for (const opts of [{ gapMs: 0 }, { bpm: 84 }, { bpm: 40, gapMs: 3000 }]) {
      const r = run(ref, { ...opts, restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5], gapMs: opts.gapMs ?? 1000 }] });
      expect(of(r, 'restart')).toHaveLength(1);
      expect(of(r, 'extra-note')).toEqual([]);
      expect(r.counts).toMatchObject({ correct: 15, wrong: 1, missing: 0 });
      expect(r.issues.filter((i) => i.type === 'early' || i.type === 'late' || i.type === 'hesitation')).toEqual([]);
    }
  });

  it('hai lần chơi lại cùng chỗ: hai lỗi "chơi lại" (nốt vấp từng lần), liên tục còn 0,32', () => {
    const r = run(ref, {
      restarts: [
        { stopBeat: 7, fromBeat: 4, slip: [D5] },
        { stopBeat: 7, fromBeat: 4, slip: [76] },
      ],
    });
    expect(of(r, 'restart').map((i) => i.message)).toEqual(['Ô 2, phách 4: đánh D5 (cần C5) rồi dừng lại, chơi lại từ đầu ô 2.', 'Ô 2, phách 4: đánh E5 (cần C5) rồi dừng lại, chơi lại từ đầu ô 2.']);
    expect(r.counts).toMatchObject({ wrong: 1, extra: 0, restarts: 2, replayed: 8 });
    expect(continuity(r)).toBeCloseTo(0.32, 6);
    expectTraceable(r);
  });

  it('vấp nhiều nốt trước khi chơi lại: nốt sai + nốt thừa của lần đầu vẫn tính, câu báo kể đủ nốt vấp', () => {
    const r = run(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5, 76] }] });
    expect(of(r, 'wrong-note')).toHaveLength(1);
    expect(of(r, 'extra-note').map((i) => i.actualMidi)).toEqual([76]);
    expect(of(r, 'restart')[0].message).toBe('Ô 2, phách 4: đánh D5, E5 (cần C5) rồi dừng lại, chơi lại từ đầu ô 2.');
  });

  it('chơi hết bài rồi chơi thêm (cả bài / ô đầu): không phải chỗ ngắt, phần chơi thêm không chấm', () => {
    const twice = run(ref, { restarts: [{ stopBeat: 16, fromBeat: 0 }] });
    expect(twice.counts).toMatchObject({ correct: 16, extra: 0, restarts: 0, replayed: 16 });
    expect(of(twice, 'restart')).toEqual([]);
    expect(twice.explanation.join(' ')).toContain('Sau khi đã chơi hết bài có chơi thêm 16 nốt');
    // Lượt thêm chỉ ô 1 (lượt cuối từ phách 16 = không còn nốt).
    const encore = run(ref, {
      restarts: [
        { stopBeat: 16, fromBeat: 0 },
        { stopBeat: 4, fromBeat: 16 },
      ],
    });
    expect(encore.counts).toMatchObject({ correct: 16, extra: 0, restarts: 0, replayed: 4 });
    expect(encore.issues.filter((i) => i.criterion === 'notes' || i.criterion === 'rhythm')).toEqual([]);
  });

  it('hai tay + hợp âm: chơi lại từ đầu ô 3 sau khi sai hợp âm', () => {
    const lesson = testLesson('E4 G4 E4 G4 | F4 A4 G4/h | E4 G4 E4 G4 | D4 F4 E4/h', { acc: 'C3+E3/h C3+E3/h | F3+A3/h G3+B3/h | C3+E3/h C3+E3/h | G3+B3/h C3+E3/h' });
    const r2 = referenceFromLesson(lesson);
    // Phách 10 (ô 3, phách 3): cần E4 + C3/E3, lần đầu đánh nhầm hợp âm F3 + A3 rồi quay lại đầu ô 3.
    const r = run(r2, { restarts: [{ stopBeat: 10, fromBeat: 8, slip: [53, 57] }], chordSpreadMs: 15, handOffsetMs: { left: 20 } });
    const stop = of(r, 'restart');
    expect(stop).toHaveLength(1);
    expect(stop[0]).toMatchObject({ measure: 3, beat: 2 });
    expect(r.issues.filter((i) => i.type === 'extra-note' || i.type === 'simultaneous-extra' || i.type === 'repeated-note')).toEqual([]);
    // Ngoài hợp âm ở chỗ vấp (chấm theo lần đầu), mọi nốt đều đúng; phần chơi lại không chấm.
    expect(r.alignment.filter((a) => a.refId !== null && !stop[0].refNoteIds.includes(a.refId)).every((a) => a.status === 'correct')).toBe(true);
    expect(r.alignment.filter((a) => a.refId !== null && stop[0].refNoteIds.includes(a.refId)).map((a) => a.status)).not.toContain('correct');
    expect(r.counts.replayed).toBeGreaterThanOrEqual(4);
    expectTraceable(r);
  });

  it('pedal đúng ký hiệu ở cả hai lượt: không lỗi pedal; khoảng pedal vắt qua chỗ dừng không chấm', () => {
    const lesson = testLesson('C4/h E4/h | F4/h A4/h | G4/h B4/h | C5/w', { pedal: [{ from: 0, to: 0 }, { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }] });
    const pr = referenceFromLesson(lesson);
    const pedal = [0, 4, 8, 12].map((s) => ({ downBeat: s + 0.25, upBeat: s + 3.95 }));
    const r = run(pr, { pedal, restarts: [{ stopBeat: 8, fromBeat: 4 }] });
    expect(of(r, 'restart')).toHaveLength(1);
    expect(r.issues.filter((i) => i.criterion === 'pedal')).toEqual([]);
    expect(r.criteria.find((c) => c.key === 'pedal')!.value).toBe(1);
    // Dừng giữa khoảng pedal ô 2 (sau B4, trước C5): khoảng đó không chấm, các khoảng khác vẫn đúng; không "đạp thừa" giả.
    const perMeasure = referenceFromLesson({ ...testLesson(MELODY), pedal: [{ from: 0, to: 0 }, { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }] });
    const mid = run(perMeasure, { pedal, restarts: [{ stopBeat: 7, fromBeat: 4 }] });
    expect(of(mid, 'restart')).toHaveLength(1);
    expect(mid.issues.filter((i) => i.criterion === 'pedal')).toEqual([]);
    expect(mid.criteria.find((c) => c.key === 'pedal')!.value).toBe(1);
    // Không đạp lại ở ô 3 của lượt chơi lại → vẫn bắt được lỗi pedal ở ô 3.
    const missed = run(perMeasure, { pedal: pedal.filter((p) => p.downBeat < 8 || p.downBeat > 12), restarts: [{ stopBeat: 7, fromBeat: 4 }] });
    expect(missed.issues.filter((i) => i.criterion === 'pedal').map((i) => i.measure)).toContain(3);
  });

  it('micro (không có thả phím): vẫn nhận ra chơi lại', () => {
    const r = scorePerformance({
      reference: referenceFromLesson(testLesson(MELODY), { singleNotesOnly: true }),
      performance: synthPerformance(ref, { source: 'microphone', latencyMs: 60, jitterMs: 15, restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5] }] }),
      session: { id: 's', profileKey: 'p', lessonId: ref.id },
      capabilities: MIC_CAPS,
    });
    expect(of(r, 'restart')).toHaveLength(1);
    expect(r.counts).toMatchObject({ extra: 0, replayed: 4 });
  });

  it('ngắt quãng trong lượt chơi lại vẫn được báo riêng', () => {
    const r = run(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5] }], gaps: [{ beat: 12, ms: 2500 }] });
    expect(of(r, 'restart')).toHaveLength(1);
    expect(of(r, 'hesitation')).toMatchObject([{ measure: 4 }]);
  });

  it('gợi ý luyện "liền mạch" ở ô có chỗ chơi lại', () => {
    const r = run(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, gapMs: 1500 }] });
    const rec = recommendPractice(r, ref).find((x) => x.kind === 'continuity');
    expect(rec?.measures).toEqual(expect.arrayContaining([2]));
  });

  it('phát lại "bản của bạn": con trỏ theo lượt đang chơi (nhảy lùi về chỗ chơi lại)', () => {
    const perf = synthPerformance(ref, { restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5] }] });
    const r = scorePerformance({ reference: ref, performance: perf, session: { id: 's', profileKey: 'p', lessonId: ref.id }, capabilities: MIDI_CAPS, now: 1 });
    const map = resultMap(r);
    const g5 = perf.notes.filter((x) => x.midi === 69); // A4: lượt 1 (ô 2), lượt 2 (ô 2), lượt 2 (ô 3)
    expect(g5.map((x) => Math.round(map.beatAt(x.onMs)))).toEqual([5, 5, 10]);
    // Phách → ms theo nốt được chấm: ô 3 nằm trong lượt chơi lại.
    expect(map.msAt(8)).toBeGreaterThan(g5[1].onMs);
  });

  it('tất định', () => {
    const opts: SynthOptions = { restarts: [{ stopBeat: 7, fromBeat: 4, slip: [D5] }], jitterMs: 25, seed: 5 };
    expect(run(ref, opts)).toEqual(run(ref, opts));
  });
});

describe('không nhận nhầm chơi lại', () => {
  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: bản chơi một mạch có sai / thiếu / thừa nốt không bị cắt lượt', (_, lesson) => {
    const ref = referenceFromLesson(lesson);
    if (ref.notes.length < 8) return;
    const pick = (k: number) => ref.notes[Math.floor((k * ref.notes.length) / 7)];
    const wrong = pick(2);
    const skip = pick(4);
    const extraAt = pick(5);
    const a = alignPerformance(
      ref,
      synthPerformance(ref, {
        jitterMs: 15,
        mods: { [wrong.id]: { midi: wrong.midi + 1 }, [skip.id]: { skip: true } },
        extras: [{ midi: extraAt.midi + 2, beat: extraAt.onsetBeat + Math.min(0.5, extraAt.durationBeats / 2) }],
      }),
    );
    expect(a.passes).toHaveLength(1);
    expect(a.replayed).toEqual([]);
  });
});
