import { describe, expect, it } from 'vitest';
import { EarFinderGame, makeTargets } from './EarFinderGame';
import { seeded } from './random';

describe('makeTargets', () => {
  it('đủ số lượt, trong dãy nốt, không lặp liền nhau', () => {
    const t = makeTargets([60, 62, 64], 30, seeded(5));
    expect(t).toHaveLength(30);
    t.forEach((m, i) => {
      expect([60, 62, 64]).toContain(m);
      if (i > 0) expect(m).not.toBe(t[i - 1]);
    });
  });
});

describe('EarFinderGame', () => {
  it('trong lúc app phát mọi nốt bị bỏ; đúng ngay lần đầu được đủ điểm', () => {
    const g = new EarFinderGame([60, 62, 64, 65], { rounds: 2 }, seeded(1));
    expect(g.answer(g.target, 0)).toBe('ignored');
    g.listenDone();
    const first = g.target;
    expect(g.answer(first, 100)).toBe('hit');
    expect(g.getState()).toMatchObject({ status: 'listen', round: 1, tries: 0, hits: 1, firstTry: 1, score: 100, lastTarget: first });
  });

  it('sai → gợi ý cao hơn / thấp hơn; hết lượt thử → app chỉ ra phím, sang vòng sau', () => {
    const g = new EarFinderGame([60, 64, 67], { rounds: 2, maxTries: 3, minIntervalMs: 0 }, seeded(2));
    g.listenDone();
    const target = g.target;
    expect(g.answer(target - 1, 10)).toBe('higher');
    expect(g.answer(target + 1, 20)).toBe('lower');
    expect(g.getState()).toMatchObject({ status: 'answer', tries: 2, combo: 0 });
    expect(g.answer(target + 2, 30)).toBe('reveal');
    expect(g.getState()).toMatchObject({ round: 1, hits: 0, lastTarget: target, status: 'listen' });
  });

  it('đúng ở lần thử thứ 3 → trừ điểm theo số lần thử; hết vòng → kết thúc', () => {
    const g = new EarFinderGame([60, 64], { rounds: 1, maxTries: 4, minIntervalMs: 0 }, seeded(9));
    g.listenDone();
    const t = g.target;
    g.answer(t + 1, 1);
    g.answer(t + 1, 2);
    expect(g.answer(t, 3)).toBe('hit');
    expect(g.getState()).toMatchObject({ status: 'finished', score: 50, hits: 1, firstTry: 0 });
    expect(g.accuracy).toBe(1);
  });

  it('nghe lại không tính lượt thử', () => {
    const g = new EarFinderGame([60, 64], { rounds: 1 }, seeded(4));
    g.listenDone();
    g.replay();
    expect(g.getState()).toMatchObject({ status: 'listen', listenId: 2, tries: 0 });
  });
});
