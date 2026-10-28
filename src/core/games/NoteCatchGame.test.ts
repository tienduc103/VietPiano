import { describe, expect, it } from 'vitest';
import { gameStars, makeNoteSequence, NoteCatchGame } from './NoteCatchGame';
import { seeded } from './random';

const CFG = { fallMs: 4000, minFallMs: 2000, gapMs: 2000, minGapMs: 1000, leadInMs: 0, graceMs: 300, lives: 3, minIntervalMs: 100 };

describe('NoteCatchGame', () => {
  it('lịch rơi nhanh dần và dày dần', () => {
    const g = new NoteCatchGame([60, 62, 64], CFG);
    g.start(0);
    const d = g.getState().drops;
    expect(d.map((x) => x.spawnAt)).toEqual([0, 2000, 3500]);
    expect(d.map((x) => x.landAt - x.spawnAt)).toEqual([4000, 3000, 2000]);
  });

  it('đánh đúng nốt đang rơi thì hứng được, có thưởng chuỗi', () => {
    const g = new NoteCatchGame([60, 62], CFG);
    g.start(0);
    expect(g.answer(60, 1000)).toBe('hit');
    expect(g.answer(62, 2500)).toBe('hit');
    const s = g.getState();
    expect(s).toMatchObject({ hits: 2, combo: 2, bestCombo: 2, score: 100 + 110, status: 'finished' });
    expect(g.accuracy).toBe(1);
  });

  it('nốt chưa xuất hiện / không có trên màn hình → sai, mất chuỗi, không hứng nốt nào', () => {
    const g = new NoteCatchGame([60, 62], CFG);
    g.start(0);
    g.answer(60, 500);
    expect(g.answer(62, 1000)).toBe('wrong'); // 62 chưa rơi (xuất hiện lúc 2000)
    expect(g.getState()).toMatchObject({ wrongs: 1, combo: 0, hits: 1 });
    expect(g.getState().drops[1].state).toBe('pending');
  });

  it('một sự kiện chỉ hứng MỘT nốt (nốt sắp chạm đáy nhất), sự kiện quá sát bị bỏ', () => {
    const g = new NoteCatchGame([60, 60, 60], { ...CFG, minFallMs: 4000, gapMs: 500, minGapMs: 500 });
    g.start(0);
    expect(g.answer(60, 1200)).toBe('hit');
    expect(g.getState().drops.map((d) => d.state)).toEqual(['hit', 'pending', 'pending']);
    expect(g.answer(60, 1250)).toBe('ignored');
    expect(g.answer(60, 1400)).toBe('hit');
    expect(g.getState().drops.map((d) => d.state)).toEqual(['hit', 'hit', 'pending']);
  });

  it('chạm đáy vẫn còn grace (bù độ trễ micro), quá grace thì mất mạng', () => {
    const g = new NoteCatchGame([60, 62, 64], CFG);
    g.start(0);
    g.tick(4200);
    expect(g.getState().misses).toBe(0);
    expect(g.answer(60, 4250)).toBe('hit');
    g.tick(5400); // nốt 2 chạm đáy lúc 5000 + grace 300
    expect(g.getState()).toMatchObject({ misses: 1, lives: 2, combo: 0 });
    expect(g.getState().drops[1].state).toBe('missed');
  });

  it('hết mạng thì kết thúc ván', () => {
    const g = new NoteCatchGame([60, 62, 64, 65], { ...CFG, lives: 2 });
    g.start(0);
    g.tick(5100);
    expect(g.getState().status).toBe('playing');
    g.tick(5900);
    expect(g.getState()).toMatchObject({ status: 'finished', lives: 0, misses: 2 });
    expect(g.answer(64, 6000)).toBe('ignored');
  });

  it('nốt vàng được gấp đôi điểm', () => {
    const g = new NoteCatchGame([60, 62], { ...CFG, golden: [62] });
    g.start(0);
    g.answer(60, 1000);
    g.answer(62, 2500);
    expect(g.getState().score).toBe(100 + 2 * 110);
    expect(g.isGolden(62)).toBe(true);
  });

  it('chưa bắt đầu thì bỏ mọi sự kiện', () => {
    const g = new NoteCatchGame([60], CFG);
    expect(g.answer(60, 0)).toBe('ignored');
    g.tick(99999);
    expect(g.getState().status).toBe('ready');
  });
});

describe('makeNoteSequence', () => {
  it('đủ số nốt, dùng mọi nốt, không nốt nào ba lần liên tiếp', () => {
    const r = seeded(7);
    for (let k = 0; k < 20; k++) {
      const seq = makeNoteSequence([60, 62], 15, r);
      expect(seq).toHaveLength(15);
      expect(new Set(seq)).toEqual(new Set([60, 62]));
      for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
    }
  });
});

it('gameStars', () => {
  expect([0, 0.1, 0.7, 0.89, 0.9, 1].map(gameStars)).toEqual([0, 1, 2, 2, 3, 3]);
});
