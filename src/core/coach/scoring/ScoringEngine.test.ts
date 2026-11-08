import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../lessons/library';
import { pedalQuality } from '../../music/pedal';
import { referenceFromLesson } from '../reference/fromLesson';
import { testLesson } from '../testing/lessons';
import { synthPerformance, type SynthOptions } from '../testing/synth';
import type { InputCapabilities, ScoreReference, ScoringResult } from '../types';
import { scorePerformance, weakestMeasures } from './ScoringEngine';

const MIDI_CAPS: InputCapabilities = { noteOff: true, velocity: true, relativeLevel: false, pedal: true, polyphonic: true };
const VIRTUAL_CAPS: InputCapabilities = { noteOff: true, velocity: false, relativeLevel: false, pedal: false, polyphonic: true };
const MIC_CAPS: InputCapabilities = { noteOff: false, velocity: false, relativeLevel: true, pedal: false, polyphonic: false };

const MELODY = 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4';

function run(ref: ScoreReference, opts: SynthOptions = {}, extra: Partial<Parameters<typeof scorePerformance>[0]> = {}): ScoringResult {
  return scorePerformance({
    reference: ref,
    performance: synthPerformance(ref, { jitterMs: 12, ...opts }),
    session: { id: 's', profileKey: 'p', lessonId: ref.id },
    capabilities: opts.velocity === null ? VIRTUAL_CAPS : MIDI_CAPS,
    now: 1,
    ...extra,
  });
}
const types = (r: ScoringResult) => r.issues.map((i) => i.type);
const crit = (r: ScoringResult, k: string) => r.criteria.find((c) => c.key === k)!;
/** Tổng khấu trừ = 100 − tổng điểm (sai số làm tròn). */
function expectTraceable(r: ScoringResult) {
  const lost = r.issues.reduce((a, i) => a + i.deduction, 0);
  expect(Math.abs(100 - lost - r.total)).toBeLessThanOrEqual(1);
  for (const c of r.criteria) {
    if (c.value === null) continue;
    const cl = r.issues.filter((i) => i.criterion === c.key).reduce((a, i) => a + i.deduction, 0);
    expect(Math.abs(c.effectiveWeight - cl - c.points)).toBeLessThan(0.1);
  }
}

describe('scorePerformance — chơi đúng', () => {
  const ref = referenceFromLesson(testLesson(MELODY));

  it('bản chơi đúng: gần 100, không có lỗi nốt / nhịp / trường độ; pedal "không chấm" kèm lý do', () => {
    const r = run(ref);
    expect(r.total).toBeGreaterThanOrEqual(98);
    expect(r.counts).toMatchObject({ refNotes: 16, correct: 16, wrong: 0, missing: 0, extra: 0 });
    expect(r.issues.filter((i) => i.criterion !== 'dynamics')).toEqual([]);
    expect(crit(r, 'pedal').value).toBeNull();
    expect(r.unavailable.map((u) => u.criterion)).toEqual(['pedal']);
    expect(r.explanation.join(' ')).toContain('Pedal');
    expect(r.confidence.overall).toBe('high');
    expectTraceable(r);
  });

  it('tempo khác mục tiêu ±5%: không báo lỗi tempo; nhanh 50%: báo tempo nhanh, không báo lệch từng nốt', () => {
    expect(types(run(ref, { bpm: 63 }))).not.toContain('tempo-fast');
    const r = run(ref, { bpm: 90 });
    expect(types(r)).toContain('tempo-fast');
    expect(r.tempo.actualBpm).toBeCloseTo(90, 0);
    expect(types(r).filter((t) => t === 'early' || t === 'late')).toEqual([]);
    expectTraceable(r);
  });

  it('nhanh dần đều (tempo thay đổi): không báo sớm / muộn từng nốt nhờ tempo cục bộ', () => {
    const r = run(ref, { msAtBeat: (b) => 1000 + 1000 * b - 10 * b * b }); // ♩=60 → ♩≈86
    expect(types(r).filter((t) => t === 'early' || t === 'late')).toEqual([]);
    expect(r.tempo.drift).toBeGreaterThan(0.2);
  });
});

describe('scorePerformance — lỗi cài sẵn được phát hiện đúng chỗ', () => {
  const ref = referenceFromLesson(testLesson(MELODY));
  const id = (n: number) => `m:${n}`;

  it('sai nốt, thiếu nốt, sai quãng tám, thừa, đánh lặp, cùng lúc', () => {
    const r = run(ref, {
      mods: { [id(1)]: { midi: 63 }, [id(6)]: { skip: true }, [id(9)]: { midi: 71 + 12 } },
      extras: [
        { midi: 81, beat: 12.5 }, // thừa giữa hai nốt
        { midi: 67, beat: 11, offsetMs: 160 }, // đánh lặp G4 ngay sau G4
        { midi: 50, beat: 4, offsetMs: 10 }, // nốt thừa cùng lúc với G4
      ],
    });
    const byType = (t: string) => r.issues.filter((i) => i.type === t);
    expect(byType('wrong-note')).toMatchObject([{ measure: 1, beat: 1, expectedMidi: 62, actualMidi: 63, hand: 'right' }]);
    expect(byType('wrong-note')[0].message).toBe('Ô 1, phách 2: cần D4, bạn đánh D#4 (tay phải).');
    expect(byType('missing-note')).toMatchObject([{ measure: 2, refNoteIds: ['m:6'] }]);
    expect(byType('octave')).toMatchObject([{ measure: 3, expectedMidi: 71, actualMidi: 83 }]);
    expect(byType('extra-note')).toMatchObject([{ measure: 4, actualMidi: 81, hand: 'unknown' }]);
    expect(byType('repeated-note')).toMatchObject([{ measure: 3, actualMidi: 67 }]);
    expect(byType('simultaneous-extra')).toMatchObject([{ measure: 2, actualMidi: 50 }]);
    expect(r.counts).toMatchObject({ correct: 13, wrong: 1, missing: 1, octave: 1, extra: 1, repeated: 1, simultaneous: 1 });
    // 1 − (1 + 1 + 0.5 + 0.5 + 0.25 + 0.5)/16
    expect(crit(r, 'notes').value).toBeCloseTo(1 - 3.75 / 16, 6);
    expectTraceable(r);
  });

  it('đánh tráo thứ tự hai nốt liền nhau → "sai thứ tự", không phải hai lỗi sai nốt', () => {
    const r = run(ref, { mods: { [id(2)]: { midi: 65 }, [id(3)]: { midi: 64 } } });
    expect(types(r).filter((t) => t === 'order')).toHaveLength(2);
    expect(types(r)).not.toContain('wrong-note');
    expect(crit(r, 'notes').value).toBeCloseTo(1 - 1 / 16, 6);
  });

  it('một nốt muộn 220 ms → đúng nốt đó bị báo muộn, các nốt khác không', () => {
    const r = run(ref, { mods: { [id(5)]: { shiftMs: 220 } }, jitterMs: 8 });
    const t = r.issues.filter((i) => i.type === 'early' || i.type === 'late');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ type: 'late', measure: 2, refNoteIds: ['m:5'] });
    expect(t[0].deviationMs).toBeGreaterThan(180);
    expect(t[0].message).toMatch(/^Ô 2, phách 2: A4 muộn \d+ ms so với nhịp của bạn\.$/);
    const a = r.alignment.find((x) => x.refId === 'm:5')!;
    expect(a.timing).toBe('late');
    expectTraceable(r);
  });

  it('ngắt 2,5 giây giữa bài → một lỗi ngắt quãng, nốt sau đó không bị tính muộn', () => {
    const r = run(ref, { gaps: [{ beat: 9, ms: 2500 }] });
    expect(r.issues.filter((i) => i.type === 'hesitation')).toMatchObject([{ measure: 3, refNoteIds: ['m:9'] }]);
    expect(types(r).filter((t) => t === 'early' || t === 'late')).toEqual([]);
    expect(crit(r, 'rhythm').subScores.find((s) => s.key === 'continuity')!.value).toBeCloseTo(0.66, 6);
  });

  it('trường độ: nhả sớm / giữ quá lâu; thả lúc đạp pedal không tính nhả sớm', () => {
    const r = run(ref, { mods: { [id(3)]: { durationRatio: 0.3 }, [id(5)]: { durationRatio: 1.6 } } });
    expect(r.issues.filter((i) => i.criterion === 'duration')).toMatchObject([
      { type: 'short', measure: 1, refNoteIds: ['m:3'] },
      { type: 'long', measure: 2, refNoteIds: ['m:5'] },
    ]);
    const withPedal = run(ref, { mods: { [id(3)]: { durationRatio: 0.3 } }, pedal: [{ downBeat: 3.1, upBeat: 3.9 }] });
    expect(withPedal.issues.filter((i) => i.type === 'short')).toEqual([]);
    const a = withPedal.alignment.find((x) => x.refId === 'm:3')!;
    expect(a.durationRatio).toBeCloseTo(0.3, 1);
    expect(a.soundingMs!).toBeGreaterThan(a.heldMs!);
  });

  it('tô điểm theo ô: ô có lỗi mất điểm; gợi ý đoạn luyện quanh ô yếu nhất', () => {
    const r = run(ref, { mods: { [id(9)]: { midi: 50 }, [id(10)]: { skip: true }, [id(12)]: { midi: 70 } } });
    const lost = Object.fromEntries(r.measures.map((m) => [m.measure, m.lost]));
    expect(lost[3]).toBeGreaterThan(0);
    expect(lost[1]).toBe(0);
    expect(weakestMeasures(r)).toEqual([3, 4]);
  });
});

describe('scorePerformance — hợp âm và hai tay', () => {
  const lesson = testLesson('E4 G4 E4 G4 | F4 A4 G4/h | E4 G4 E4 G4 | D4 F4 E4/h', { acc: 'C3+E3/h C3+E3/h | F3+A3/h G3+B3/h | C3+E3/h C3+E3/h | G3+B3/h C3+E3/h' });
  const ref = referenceFromLesson(lesson);

  it('chơi đúng hai tay: không lỗi, có tổng hợp từng tay + tỉ lệ đồng bộ', () => {
    const r = run(ref);
    expect(r.issues.filter((i) => i.criterion !== 'dynamics')).toEqual([]);
    expect(r.hands.right).toMatchObject({ notes: 14, correct: 14 });
    expect(r.hands.left).toMatchObject({ notes: 16, correct: 16 });
    expect(r.hands.syncRate).toBe(1);
  });

  it('tay trái trễ 150 ms ở mọi chỗ → lỗi lệch hai tay chỉ ra tay trái', () => {
    const r = run(ref, { handOffsetMs: { left: 150 }, jitterMs: 0 });
    const async = r.issues.filter((i) => i.type === 'hands-async');
    expect(async.length).toBe(8);
    expect(async.every((i) => i.hand === 'left')).toBe(true);
    expect(r.hands.syncRate).toBe(0);
    expect(r.hands.meanOffsetMs).toBeCloseTo(150, -1);
  });

  it('sai một nốt trong hợp âm / thiếu một nốt hợp âm → lỗi riêng của hợp âm, đúng tay', () => {
    const r = run(ref, { mods: { 'a:2:1': { midi: 53 }, 'a:3:0': { skip: true } } });
    expect(r.issues.filter((i) => i.type === 'chord-wrong-note')).toMatchObject([{ hand: 'left', measure: 2, expectedMidi: 57, actualMidi: 53 }]);
    expect(r.issues.filter((i) => i.type === 'chord-missing-note')).toMatchObject([{ hand: 'left', measure: 2, refNoteIds: ['a:3:0'] }]);
  });

  it('hợp âm cùng tay rải 70 ms → lỗi vào không cùng lúc', () => {
    const r = referenceFromLesson(testLesson('C4+E4+G4/h C4+E4+G4/h | D4+F4+A4/w'));
    const res = run(r, { chordSpreadMs: 70, jitterMs: 0 });
    expect(res.issues.filter((i) => i.type === 'chord-async').length).toBe(3);
    expect(res.issues.filter((i) => i.criterion === 'notes')).toEqual([]);
  });

  it('cân bằng bè: tay trái to hơn giai điệu → lỗi cân bằng', () => {
    const r = run(ref, { velocity: (n) => (n.hand === 'left' ? 100 : 60) });
    expect(types(r)).toContain('balance');
    const ok = run(ref, { velocity: (n) => (n.hand === 'left' ? 55 : 80) });
    expect(types(ok)).not.toContain('balance');
  });
});

describe('scorePerformance — pedal', () => {
  const lesson = testLesson('C4/h E4/h | F4/h A4/h | G4/h B4/h | C5/w', { pedal: [{ from: 0, to: 0 }, { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }] });
  const ref = referenceFromLesson(lesson);
  const good = [0, 4, 8, 12].map((s) => ({ downBeat: s + 0.25, upBeat: s + 3.95 }));

  it('đạp / thay pedal đúng ký hiệu → pedal 100%', () => {
    const r = run(ref, { pedal: good });
    expect(crit(r, 'pedal').value).toBe(1);
    expect(r.issues.filter((i) => i.criterion === 'pedal')).toEqual([]);
  });

  it('không thay pedal ở đầu ô 2, đạp muộn ở ô 4 → đúng loại lỗi (gộp một lỗi mỗi chỗ) + giá trị = pedalQuality', () => {
    const pedal = [
      { downBeat: 0.25, upBeat: 7.9 },
      { downBeat: 8.25, upBeat: 11.95 },
      { downBeat: 14, upBeat: null },
    ];
    const r = run(ref, { pedal, jitterMs: 0 });
    const p = r.issues.filter((i) => i.criterion === 'pedal');
    expect(p.map((i) => [i.type, i.measure])).toEqual([
      ['pedal-not-changed', 2],
      ['pedal-late', 4],
    ]);
    const beats = pedal.flatMap((x) => [{ beat: x.downBeat, down: true }, ...(x.upBeat === null ? [] : [{ beat: x.upBeat, down: false }])]);
    expect(crit(r, 'pedal').value).toBeCloseTo(pedalQuality(ref.pedal.ranges, beats, ref.totalBeats), 2);
    expectTraceable(r);
  });

  it('đạp thừa ở bài chọn "không dùng pedal"; đàn chưa gửi pedal → chưa đủ điều kiện chấm', () => {
    const plain = referenceFromLesson(testLesson(MELODY));
    const r = run(plain, { pedal: [{ downBeat: 2, upBeat: 12 }] }, { pedalRule: 'none-expected' });
    expect(r.issues.filter((i) => i.criterion === 'pedal')).toMatchObject([{ type: 'pedal-continuous', measure: 1 }]);
    expect(crit(r, 'pedal').value).toBe(0);
    const noData = run(ref, {}, { capabilities: { ...MIDI_CAPS, pedal: false } });
    expect(crit(noData, 'pedal').value).toBeNull();
    expect(crit(noData, 'pedal').reason).toContain('CC 64');
  });

  it('bài chỉ gợi ý pedal (pedalOptional) → không chấm pedal', () => {
    const opt = referenceFromLesson({ ...lesson, pedalOptional: true });
    expect(crit(run(opt, { pedal: good }), 'pedal').value).toBeNull();
  });
});

describe('scorePerformance — sắc thái', () => {
  const lesson = testLesson('C4 D4 E4 F4 | G4 F4 E4 D4 | C4 D4 E4 F4 | G4 F4 E4 D4', { dynamics: [{ index: 0, mark: 'p' }, { index: 8, mark: 'f' }] });
  const ref = referenceFromLesson(lesson);

  it('đổi p → f đúng: không lỗi tương phản; đánh đều tay như nhau: lỗi tương phản ở ô 3', () => {
    const ok = run(ref, { velocity: (n) => (n.dynamic === 'f' ? 100 : 50) });
    expect(types(ok)).not.toContain('dynamics-contrast');
    const flat = run(ref, { velocity: 70 });
    expect(flat.issues.filter((i) => i.type === 'dynamics-contrast')).toMatchObject([{ measure: 3 }]);
    expect(flat.dynamicsInfo!.sections).toEqual([
      { mark: 'p', medianVelocity: 70, targetVelocity: 50 },
      { mark: 'f', medianVelocity: 70, targetVelocity: 100 },
    ]);
  });

  it('lực gõ không đều trong một đoạn → lỗi đều lực', () => {
    const r = run(ref, { velocity: (n) => (n.dynamic === 'f' ? 100 : n.scoreIndex % 2 ? 30 : 75) });
    expect(types(r)).toContain('velocity-uneven');
  });

  it('cresc. không to dần → lỗi hình nêm', () => {
    const r = referenceFromLesson({ ...testLesson(MELODY), hairpins: [{ from: 0, to: 7, type: 'cresc' }] });
    expect(types(run(r, { velocity: 70 }))).toContain('hairpin');
    expect(types(run(r, { velocity: (n) => 40 + n.scoreIndex * 8 }))).not.toContain('hairpin');
  });

  it('bàn phím ảo (không có lực gõ) → không chấm lực đánh, chia lại trọng số', () => {
    const r = run(ref, { velocity: null });
    expect(crit(r, 'dynamics').value).toBeNull();
    expect(crit(r, 'notes').effectiveWeight).toBeCloseTo((40 / 80) * 100, 1);
  });
});

describe('scorePerformance — nguồn vào và chế độ', () => {
  const ref = referenceFromLesson(testLesson(MELODY));

  it('micro: không trường độ / pedal / đều lực; độ tin cậy trung bình; trừ trễ 60 ms', () => {
    const r = scorePerformance({
      reference: ref,
      performance: synthPerformance(ref, { source: 'microphone', latencyMs: 60, jitterMs: 15 }),
      session: { id: 's', profileKey: 'p', lessonId: ref.id },
      capabilities: MIC_CAPS,
    });
    expect(crit(r, 'duration').value).toBeNull();
    expect(crit(r, 'dynamics').value).toBeNull();
    expect(r.counts.correct).toBe(16);
    expect(r.confidence.overall).toBe('medium');
    expect(crit(r, 'notes').effectiveWeight + crit(r, 'rhythm').effectiveWeight).toBeCloseTo(100, 1);
  });

  it('Mode B (biểu diễn) chấp nhận rubato hơn Mode A', () => {
    const rubato: SynthOptions = { msAtBeat: (b) => 1000 + b * 1000 + 160 * Math.sin(b * 1.3), jitterMs: 0 };
    const a = run(ref, rubato);
    const b = run(ref, rubato, { mode: 'performance' });
    expect(crit(b, 'rhythm').value!).toBeGreaterThan(crit(a, 'rhythm').value!);
    expect(b.criteria.map((c) => c.weight)).toEqual([30, 30, 10, 10, 20]);
  });

  it('trọng số tuỳ biến theo mục tiêu bài', () => {
    const r = run(ref, {}, { weights: { notes: 70, rhythm: 30, duration: 0, pedal: 0, dynamics: 0 } });
    expect(crit(r, 'notes').effectiveWeight).toBeCloseTo(70, 6);
    expect(crit(r, 'duration').effectiveWeight).toBe(0);
  });

  it('chơi bài khác hẳn → độ tin cậy thấp + giải thích', () => {
    const other = synthPerformance(referenceFromLesson(testLesson('F#5 G#5 A#5 C#6 | D#6 F#5 G#5/h | A#5 C#6 D#6 F#6 | G#6/w')));
    const r = scorePerformance({ reference: ref, performance: other, session: { id: 's', profileKey: 'p', lessonId: 'x' }, capabilities: MIDI_CAPS });
    expect(r.confidence.overall).toBe('low');
    expect(r.explanation.join(' ')).toContain('có thể đã chơi bài khác');
  });

  it('không chơi nốt nào → 0 điểm nốt, không lỗi giả ở các tiêu chí khác', () => {
    const r = run(ref, { mods: Object.fromEntries(ref.notes.map((n) => [n.id, { skip: true }])) });
    expect(crit(r, 'notes').value).toBe(0);
    expect(r.issues.every((i) => i.type === 'missing-note')).toBe(true);
  });

  it('tất định: cùng đầu vào → cùng kết quả', () => {
    expect(run(ref, { jitterMs: 30, seed: 3 })).toEqual(run(ref, { jitterMs: 30, seed: 3 }));
  });
});

describe('scorePerformance — toàn bộ thư viện bài (bản chơi đúng không bị báo lỗi giả)', () => {
  it.each(LESSONS.map((l) => [l.id, l] as const))('%s', (_, lesson) => {
    const ref = referenceFromLesson(lesson);
    if (!ref.notes.length) return;
    const pedal = ref.pedal.graded ? ref.pedal.ranges.map((p) => ({ downBeat: p.startBeat + 0.2, upBeat: p.endBeat - 0.08 })) : [];
    const r = run(ref, { pedal, jitterMs: 10, velocity: (n) => n.velocityTarget });
    const bad = r.issues.filter((i) => i.criterion === 'notes' || i.type === 'early' || i.type === 'late' || i.type === 'hesitation' || i.type === 'restart' || i.criterion === 'duration' || i.criterion === 'pedal');
    expect(bad.map((i) => i.message)).toEqual([]);
    expect(r.counts).toMatchObject({ restarts: 0, replayed: 0 });
    expect(r.total).toBeGreaterThanOrEqual(95);
  });
});
