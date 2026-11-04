import { describe, expect, it } from 'vitest';
import { FiveFingerDrill, DEFAULT_DRILL_CONFIG } from './FiveFingerDrill';
import { chainSteps, generateChain, type ChainStep, type StepNote } from './generator';

const P = { position: 'C' as const, rightOctave: 4, leftOctave: 3 };
const note = (midi: number, hand: 'right' | 'left' = 'right', index = 0): StepNote => ({ midi, hand, index, finger: 1, pitch: 'C4' });
const single = (...midis: number[]): ChainStep[] => midis.map((m) => ({ notes: [note(m)], duration: 'q' }));
const pairs = (...p: [number, number][]): ChainStep[] => p.map(([r, l]) => ({ notes: [note(r, 'right'), note(l, 'left')], duration: 'q' }));

describe('FiveFingerDrill — một tay', () => {
  it('đúng → sang bước kế; sai → giữ nguyên, đếm lỗi; đủ 8 nốt → hoàn thành', () => {
    const steps = chainSteps(generateChain({ handMode: 'right', difficulty: 'easy' }, 1), P);
    const d = new FiveFingerDrill(steps);
    d.start(0);
    let t = 1000;
    expect(d.handleNote(30, t)).toBe('wrong');
    expect(d.getState().index).toBe(0);
    for (const [i, st] of steps.entries()) {
      t += 500;
      expect(d.handleNote(st.notes[0].midi, t)).toBe(i === steps.length - 1 ? 'finished' : 'correct');
    }
    const s = d.getState();
    expect(s.status).toBe('finished');
    expect(s.results[0]).toBe('corrected');
    expect(s.results.slice(1).every((r) => r === 'correct')).toBe(true);
    expect(d.summary()).toMatchObject({ steps: 8, correctNotes: 8, wrongNotes: 1, firstTry: 7 });
  });

  it('mỗi sự kiện tiến tối đa một bước; sự kiện quá sát lần chuyển bị bỏ qua (nốt lặp)', () => {
    const d = new FiveFingerDrill(single(60, 60, 62));
    expect(d.handleNote(60, 1000)).toBe('correct');
    expect(d.handleNote(60, 1000 + DEFAULT_DRILL_CONFIG.minAdvanceIntervalMs - 1)).toBe('ignored');
    expect(d.getState().index).toBe(1);
    expect(d.handleNote(60, 1400)).toBe('correct');
    expect(d.getState().index).toBe(2);
  });

  it('thời gian phản ứng tính từ lúc bước bắt đầu, trừ thời gian tạm dừng; lúc dừng bỏ qua nốt', () => {
    const d = new FiveFingerDrill(single(60, 62));
    d.start(0);
    d.pause(500);
    expect(d.handleNote(60, 800)).toBe('ignored');
    d.resume(10_500);
    d.handleNote(60, 11_000);
    expect(d.getRecords()[0].reactionMs).toBe(1000);
  });

  it('phản ứng chậm không bị tính sai (Wait Mode)', () => {
    const d = new FiveFingerDrill(single(60));
    d.start(0);
    expect(d.handleNote(60, 60_000)).toBe('finished');
    expect(d.summary()).toMatchObject({ wrongNotes: 0, accuracy: 1, firstTry: 1 });
  });

  it('chấm nhịp: khoảng giữa các bước so với trường độ theo bpm', () => {
    const d = new FiveFingerDrill(single(60, 62, 64, 65), { ...DEFAULT_DRILL_CONFIG, rhythmBpm: 60 });
    d.handleNote(60, 0);
    d.handleNote(62, 1000);
    d.handleNote(64, 2050);
    d.handleNote(65, 3600);
    expect(d.summary().rhythm).toMatchObject({ intervals: 3, onTime: 2 });
  });

  it('nốt sai ghi lại nốt cần đánh và nốt nhầm', () => {
    const d = new FiveFingerDrill(single(64));
    d.handleNote(62, 0);
    expect(d.getAttempts()[0]).toMatchObject({ played: 62, ok: false, expected: { midi: 64 } });
  });
});

describe('FiveFingerDrill — hai tay cùng lúc', () => {
  it('chỉ chuyển bước khi đủ hai nốt đúng trong ngưỡng đồng thời', () => {
    const d = new FiveFingerDrill(pairs([60, 48], [62, 50]));
    expect(d.handleNote(60, 1000)).toBe('partial');
    expect(d.getState().index).toBe(0);
    expect(d.pendingNotes().map((n) => n.midi)).toEqual([48]);
    expect(d.handleNote(48, 1040)).toBe('correct');
    expect(d.getState().index).toBe(1);
    expect(d.getRecords()[0].syncSpreadMs).toBe(40);
    // Thứ tự bất kỳ: tay trái trước.
    expect(d.handleNote(50, 1500)).toBe('partial');
    expect(d.handleNote(62, 1500 + DEFAULT_DRILL_CONFIG.syncToleranceMs)).toBe('finished');
  });

  it('không yêu cầu cùng một mili giây, nhưng quá ngưỡng → chưa cùng lúc, phải đánh lại (không tính sai nốt)', () => {
    const d = new FiveFingerDrill(pairs([60, 48]));
    d.handleNote(60, 1000);
    expect(d.handleNote(48, 1000 + DEFAULT_DRILL_CONFIG.syncToleranceMs + 1)).toBe('late-sync');
    expect(d.getState()).toMatchObject({ index: 0, wrong: 0, lateSync: 1 });
    // Nốt tay trái vừa đánh thành lần đánh đầu mới → tay phải theo kịp là xong.
    expect(d.handleNote(60, 1400)).toBe('finished');
    expect(d.getState().results[0]).toBe('corrected');
  });

  it('nốt sai xoá lần đánh dở; một tay đánh lặp lại không đủ để qua bước', () => {
    const d = new FiveFingerDrill(pairs([60, 48]));
    d.handleNote(60, 0);
    expect(d.handleNote(61, 10)).toBe('wrong');
    expect(d.getState().hitMidis).toEqual([]);
    expect(d.handleNote(60, 20)).toBe('partial');
    expect(d.handleNote(60, 30)).toBe('partial');
    expect(d.getState().index).toBe(0);
    expect(d.handleNote(48, 40)).toBe('finished');
  });

  it('tạm dừng giữa lúc đánh dở → phải đánh lại cả hai tay', () => {
    const d = new FiveFingerDrill(pairs([60, 48]));
    d.handleNote(60, 0);
    d.pause(50);
    d.resume(60);
    expect(d.handleNote(48, 70)).toBe('partial');
    expect(d.handleNote(60, 80)).toBe('finished');
  });

  it('luyện lại: về bước đầu, xoá thống kê', () => {
    const d = new FiveFingerDrill(single(60, 62));
    d.handleNote(61, 0);
    d.handleNote(60, 10);
    d.restart();
    expect(d.getState()).toMatchObject({ index: 0, wrong: 0, correct: 0, status: 'waiting' });
    expect(d.getAttempts()).toHaveLength(0);
  });
});
