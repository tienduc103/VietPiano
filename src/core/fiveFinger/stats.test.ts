import { beforeEach, describe, expect, it } from 'vitest';
import { FiveFingerDrill } from './FiveFingerDrill';
import { chainSteps, generateChain, type ChainStep } from './generator';
import { adviseDifficulty, applyChainResult, emptyStats, handAccuracy, handReactionMs, sanitizeStats, troubleNotes, weakMovements, type ChainResultInput, type FiveFingerStats } from './stats';
import { loadFiveFingerSettings, loadFiveFingerStats, recordFiveFingerChain, sanitizeSessionSettings, saveFiveFingerSettings } from './storage';

const P = { position: 'C' as const, rightOctave: 4, leftOctave: 3 };

/** Chơi một chuỗi: `mistakes[i]` = nốt sai đánh trước nốt đúng ở bước i. */
function play(steps: ChainStep[], mistakes: Record<number, number[]> = {}, at = 0): ChainResultInput {
  const d = new FiveFingerDrill(steps);
  d.start(at);
  let t = at;
  steps.forEach((st, i) => {
    for (const m of mistakes[i] ?? []) d.handleNote(m, (t += 300));
    t += 500;
    st.notes.forEach((n, k) => d.handleNote(n.midi, t + k * 10));
  });
  return { at: t, seed: 1, handMode: 'right', difficulty: 'easy', position: 'C', steps, records: d.getRecords(), attempts: d.getAttempts(), summary: d.summary() };
}

const rightSteps = (seed = 1) => chainSteps(generateChain({ handMode: 'right', difficulty: 'easy' }, seed), P);

describe('thống kê cá nhân', () => {
  it('tỉ lệ đúng theo tay, thời gian phản ứng, nốt hay sai + nốt nhầm, ngón được hướng dẫn', () => {
    const steps = rightSteps();
    const target = steps[2].notes[0];
    const stats = applyChainResult(emptyStats(), play(steps, { 2: [target.midi + 1, target.midi + 1] }));
    expect(stats.hands.right).toMatchObject({ correct: 8, wrong: 2, chains: 1, perfectChains: 0 });
    expect(handAccuracy(stats.hands.right)).toBeCloseTo(0.8);
    expect(handReactionMs(stats.hands.right)).toBeGreaterThan(0);
    const trouble = troubleNotes(stats);
    expect(trouble[0]).toMatchObject({ midi: target.midi, finger: target.finger, wrong: 2, topConfusion: target.midi + 1 });
    expect(stats.history).toHaveLength(1);
  });

  it('chuyển động hay sai → được đề xuất luyện thêm', () => {
    let stats: FiveFingerStats = emptyStats();
    const steps: ChainStep[] = [0, 1, 0, 1, 0, 1, 0, 1].map((index) => ({
      notes: [{ midi: [60, 62][index], hand: 'right', index, finger: index + 1, pitch: ['C4', 'D4'][index] }],
      duration: 'q',
    }));
    for (let i = 0; i < 3; i++) stats = applyChainResult(stats, play(steps, { 1: [64], 3: [64] }));
    expect(weakMovements(stats)).toEqual([{ hand: 'right', from: 0, to: 1 }]);
    expect(weakMovements(stats, ['left'])).toEqual([]);
  });

  it('hai tay: đếm số bước cùng lúc / lệch', () => {
    const steps = chainSteps(generateChain({ handMode: 'together', difficulty: 'easy' }, 2), P);
    const stats = applyChainResult(emptyStats(), { ...play(steps), handMode: 'together' });
    expect(stats.sync).toMatchObject({ steps: 8, together: 8, lateSync: 0 });
    expect(stats.hands.left.correct).toBe(8);
    expect(stats.hands.right.correct).toBe(8);
  });

  it('đề xuất tăng độ khó khi tốt liên tiếp, giảm khi hay sai', () => {
    let good = emptyStats();
    for (let i = 0; i < 3; i++) good = applyChainResult(good, play(rightSteps(i)));
    expect(adviseDifficulty(good, 'right', 'easy')).toEqual({ advice: 'harder', target: 'medium' });
    expect(adviseDifficulty(good, 'left', 'easy').advice).toBe('stay');

    let bad = emptyStats();
    for (let i = 0; i < 3; i++) {
      const steps = rightSteps(i);
      const r = play(steps, Object.fromEntries(steps.map((s, k) => [k, [s.notes[0].midi + 1]])));
      bad = applyChainResult(bad, { ...r, difficulty: 'medium' });
    }
    expect(adviseDifficulty(bad, 'right', 'medium')).toEqual({ advice: 'easier', target: 'easy' });
    expect(adviseDifficulty(bad, 'right', 'easy').advice).toBe('stay');
  });

  it('dữ liệu hỏng → bỏ phần hỏng', () => {
    expect(sanitizeStats('x')).toEqual(emptyStats());
    const s = sanitizeStats({ hands: { right: { correct: 3, wrong: -1 } }, notes: { a: { hand: 'up' } }, history: [{ seed: 1, accuracy: 1, handMode: 'right' }, null] });
    expect(s.hands.right.correct).toBe(3);
    expect(s.hands.right.wrong).toBe(0);
    expect(s.notes).toEqual({});
    expect(s.history).toHaveLength(1);
  });
});

describe('lưu theo hồ sơ', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it('thống kê + cài đặt riêng từng hồ sơ', () => {
    recordFiveFingerChain('a', play(rightSteps()));
    expect(loadFiveFingerStats('a').history).toHaveLength(1);
    expect(loadFiveFingerStats('b').history).toHaveLength(0);
    saveFiveFingerSettings('a', { ...loadFiveFingerSettings('a'), handMode: 'left', difficulty: 'hard', chainsPerSession: 0 });
    expect(loadFiveFingerSettings('a')).toMatchObject({ handMode: 'left', difficulty: 'hard', chainsPerSession: 0 });
    expect(loadFiveFingerSettings('b').handMode).toBe('right');
  });

  it('cài đặt hỏng → mặc định; hai tay không chồng phím', () => {
    expect(sanitizeSessionSettings({ handMode: 'x', chainsPerSession: 7, bpm: 500 })).toMatchObject({ handMode: 'right', chainsPerSession: 10, bpm: 60, rightOctave: 4, leftOctave: 3 });
    const s = sanitizeSessionSettings({ position: 'G', rightOctave: 5, leftOctave: 2 });
    expect(s).toMatchObject({ position: 'G', rightOctave: 4, leftOctave: 2 });
  });
});
