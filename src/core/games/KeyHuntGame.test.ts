import { describe, expect, it } from 'vitest';
import { KeyHuntGame } from './KeyHuntGame';

const isC = (m: number) => m % 12 === 0;
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);

describe('KeyHuntGame', () => {
  it('đúng nhanh nhiều điểm hơn; chuỗi đúng có thưởng', () => {
    const g = new KeyHuntGame([isC, isC, isBlack], { roundMs: 4000, minIntervalMs: 200 });
    g.start(0);
    expect(g.answer(60, 0)).toBe('hit'); // còn đủ giờ: 50 + 50
    expect(g.answer(72, 2000)).toBe('hit'); // lượt 2 bắt đầu lúc 0 → còn 50% giờ: 50 + 25 + 10
    expect(g.getState()).toMatchObject({ index: 2, hits: 2, combo: 2, score: 100 + 85 });
  });

  it('sai thì mất chuỗi, vẫn ở lượt đó; sự kiện quá sát lần chuyển lượt bị bỏ', () => {
    const g = new KeyHuntGame([isC, isBlack], { roundMs: 4000, minIntervalMs: 200 });
    g.start(0);
    g.answer(60, 100);
    expect(g.answer(60, 150)).toBe('ignored');
    expect(g.answer(60, 400)).toBe('wrong');
    expect(g.getState()).toMatchObject({ index: 1, wrongs: 1, combo: 0 });
    expect(g.answer(61, 600)).toBe('hit');
    expect(g.getState()).toMatchObject({ status: 'finished', results: ['hit', 'hit'] });
    expect(g.accuracy).toBe(1);
  });

  it('hết giờ lượt → trượt, sang lượt sau; hết lượt → kết thúc', () => {
    const g = new KeyHuntGame([isC, isC], { roundMs: 1000, minIntervalMs: 200 });
    g.start(0);
    g.tick(999);
    expect(g.getState().index).toBe(0);
    g.tick(1000);
    expect(g.getState()).toMatchObject({ index: 1, misses: 1, results: ['miss', 'pending'], roundStartedAt: 1000 });
    g.tick(2000);
    expect(g.getState()).toMatchObject({ status: 'finished', misses: 2 });
    expect(g.accuracy).toBe(0);
  });

  it('remaining: phần thời gian còn lại của lượt', () => {
    const g = new KeyHuntGame([isC], { roundMs: 1000 });
    g.start(500);
    expect(g.remaining(500)).toBe(1);
    expect(g.remaining(750)).toBe(0.75);
    expect(g.remaining(3000)).toBe(0);
  });
});
