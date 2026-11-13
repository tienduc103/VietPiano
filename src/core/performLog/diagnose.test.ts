import { describe, expect, it } from 'vitest';
import { diagnose, hintText, mainSource, median } from './diagnose';
import type { LoggedEvent, LoggedNote } from './types';

/** Nốt đen liên tiếp từ phách 0. */
function notes(midis: number[], results: Partial<LoggedNote>[] = []): LoggedNote[] {
  return midis.map((m, i) => ({ i, b: i, d: 1, m, r: 'pending', off: null, pm: null, held: null, ...(results[i] ?? {}) }));
}

const ev = (m: number, beat: number, out: LoggedEvent['out'], extra: Partial<LoggedEvent> = {}): LoggedEvent => ({ t: beat * 1000, src: 'midi', m, lag: 0, beat, out, ...extra });

describe('diagnose', () => {
  it('nốt sai: nốt kề (lệch nhịp) được xét trước, rồi quãng tám / nửa cung / một bậc / khác', () => {
    const ns = notes([60, 62, 64, 65, 67, 72], [
      {},
      { r: 'wrong', pm: 60, off: 200 }, // trùng nốt liền trước → nốt kề
      { r: 'wrong', pm: 76, off: 0 }, // quãng tám (nốt kề là 62, 65)
      { r: 'wrong', pm: 66, off: 0 }, // nửa cung (nốt kề là 64, 67)
      { r: 'wrong', pm: 69, off: 0 }, // một bậc (nốt kề là 65, 72)
      { r: 'wrong', pm: 75, off: 0 }, // khác
    ]);
    expect(diagnose(ns, [], { onTimeMs: 150 }).wrong).toEqual({ neighbor: 1, octave: 1, semitone: 1, step: 1, other: 1 });
  });

  it('nốt lỡ: không tín hiệu / gõ ngoài cửa sổ / bị màn bỏ / bị chống lặp / đã chấm cho nốt khác', () => {
    const ns = notes([60, 62, 64, 65, 67], [
      { r: 'skipped' },
      { r: 'skipped' },
      { r: 'skipped' },
      { r: 'skipped' },
      { r: 'skipped' },
    ]);
    const events = [
      ev(62, 1.8, 'extra'),
      ev(64, 2.2, 'dropped', { why: 'harmony' }),
      ev(65, 3, 'ignored'),
      ev(67, 3.6, 'hit', { note: 3 }),
      ev(60, 2.5, 'extra'), // xa nốt 60 (phách 0) quá 1 phách → không tính cho nốt đó
    ];
    const d = diagnose(ns, events, { onTimeMs: 150 });
    expect(d.missed).toEqual({ noInput: 1, extra: 1, dropped: 1, ignored: 1, other: 1 });
    expect(d.extras).toEqual({ nearNote: 1, stray: 1 });
    expect(d.inputs).toMatchObject({ total: 5, graded: 1, extra: 2, ignored: 1, dropped: { harmony: 1 } });
  });

  it('octaveTolerant: nốt lỡ xét cả sự kiện cùng tên nốt khác quãng tám', () => {
    const ns = notes([60], [{ r: 'skipped' }]);
    expect(diagnose(ns, [ev(72, 0.2, 'dropped')], { onTimeMs: 150 }).missed.noInput).toBe(1);
    expect(diagnose(ns, [ev(72, 0.2, 'dropped')], { onTimeMs: 150, octaveTolerant: true }).missed.dropped).toBe(1);
  });

  it('thống kê lệch nhịp + nghi vấn trễ đều, nốt kề', () => {
    const ns = notes([60, 62, 64, 65, 67, 69], [
      { r: 'correct', pm: 60, off: 180 },
      { r: 'wrong', pm: 60, off: 220 },
      { r: 'wrong', pm: 62, off: 210 },
      { r: 'wrong', pm: 64, off: 190 },
      { r: 'correct', pm: 67, off: 120 },
      { r: 'skipped' },
    ]);
    const d = diagnose(ns, [], { onTimeMs: 150 });
    expect(d.timing).toMatchObject({ n: 5, medianMs: 190, meanMs: 184, late: 4, early: 0 });
    expect(d.timing.p10Ms).toBeCloseTo(144);
    expect(d.timing.p90Ms).toBeCloseTo(216);
    expect(d.wrong.neighbor).toBe(3);
    // Một nốt lỡ không đủ ngưỡng "không có tín hiệu".
    expect(d.hints).toEqual(['late', 'misaligned']);
    expect(hintText('late', d, 6)).toBe('trễ đều ~190 ms');
    expect(hintText('misaligned', d, 6)).toBe('3/3 nốt sai là nốt kề (lệch nhịp)');
  });

  it('nghi vấn: không có tín hiệu, bị bỏ, chống lặp, đúng phím ngoài cửa sổ; dưới ngưỡng thì không nêu', () => {
    const ns = notes([60, 62, 64, 65], [{ r: 'skipped' }, { r: 'skipped' }, { r: 'skipped' }, { r: 'correct', pm: 65, off: 0 }]);
    const quiet = diagnose(ns, [ev(65, 3, 'hit', { note: 3 })], { onTimeMs: 150 });
    expect(quiet.hints).toEqual(['no-input']);
    expect(hintText('no-input', quiet, 4)).toBe('3/4 nốt không có tín hiệu');

    const noisy = diagnose(
      ns,
      [
        ev(60, 0.1, 'dropped', { why: 'other-hand' }),
        ev(62, 1.1, 'dropped', { why: 'other-hand' }),
        ev(64, 2.1, 'dropped', { why: 'listening' }),
        ev(65, 3, 'hit', { note: 3 }),
        ev(65, 3.02, 'ignored'),
        ev(65, 3.03, 'ignored'),
        ev(65, 3.04, 'ignored'),
        ev(62, 1.7, 'extra'),
        ev(64, 2.7, 'extra'),
        ev(60, 0.6, 'extra'),
      ],
      { onTimeMs: 150 },
    );
    expect(noisy.hints).toEqual(['dropped', 'ignored', 'extras-near']);
    expect(hintText('dropped', noisy, 4)).toBe('3 nốt bị bỏ trước khi chấm (other-hand 2, listening 1)');
  });

  it('micro bị bỏ vì đang nối đàn MIDI: bình thường khi lượt có nốt MIDI; không có nốt MIDI nào → là nguyên nhân lỡ nốt', () => {
    const ns = notes([60, 62, 64, 65], [{ r: 'skipped' }, { r: 'skipped' }, { r: 'skipped' }, { r: 'skipped' }]);
    const micDrops = [60, 62, 64].map((m, i) => ev(m, i + 0.05, 'dropped', { src: 'mic', why: 'mic-while-midi' }));
    // Đàn MIDI nối nhưng không gửi nốt (vd chỉ cắm cáp) → mọi nốt micro bị bỏ.
    const blocked = diagnose(ns, micDrops, { onTimeMs: 150 });
    expect(blocked.missed).toMatchObject({ dropped: 3, noInput: 1 });
    expect(blocked.hints).toContain('dropped');
    expect(hintText('dropped', blocked, 4)).toBe('3 nốt bị bỏ trước khi chấm (mic-while-midi 3)');
    // Có nốt MIDI: micro nghe tiếng đàn bị bỏ không phải nguyên nhân.
    const withMidi = diagnose(ns, [...micDrops, ev(65, 3.5, 'extra')], { onTimeMs: 150 });
    expect(withMidi.missed).toMatchObject({ dropped: 0, noInput: 3, extra: 1 });
    expect(withMidi.hints).not.toContain('dropped');
    expect(withMidi.inputs.dropped).toEqual({ 'mic-while-midi': 3 });
  });

  it('lag theo nguồn (trung vị) + nguồn chính', () => {
    const d = diagnose(notes([60]), [ev(60, 0, 'hit', { lag: 10 }), ev(60, 0, 'ignored', { lag: 30 }), ev(60, 0, 'extra', { src: 'mic', lag: -5 })], { onTimeMs: 150 });
    expect(d.lagMs).toEqual({ midi: 20, mic: -5 });
    expect(d.hints).not.toContain('clock-skew');
    expect(mainSource(d)).toBe('midi');
    expect(mainSource(diagnose(notes([60]), [], { onTimeMs: 150 }))).toBeNull();
  });

  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
