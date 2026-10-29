import { describe, expect, it } from 'vitest';
import { SteadyBeatGame } from './SteadyBeatGame';

/** 60 BPM → 1 phách = 1000 ms; 4 phách metronome: click lúc 0, 1000, 2000, 3000. */
const cfg = { bpm: 60, guideBeats: 4, silentBeats: 4, perfectPct: 0.05, goodPct: 0.15, minIntervalBeats: 0.4 };

describe('SteadyBeatGame', () => {
  it('metronome: guideBeats tiếng click, phách đầu ô nhịp là phách mạnh', () => {
    const g = new SteadyBeatGame({ ...cfg, guideBeats: 8 });
    g.start(100);
    expect(g.clicks.map((c) => c.at)).toEqual([100, 1100, 2100, 3100, 4100, 5100, 6100, 7100]);
    expect(g.clicks.map((c) => c.accent)).toEqual([true, false, false, false, true, false, false, false]);
  });

  it('gõ lúc metronome còn kêu không chấm; tự giữ đều → Đều cả', () => {
    const g = new SteadyBeatGame(cfg);
    g.start(0);
    expect(g.tap(2000)).toBe('guide');
    expect(g.tap(3000)).toBe('guide');
    for (const t of [4000, 5010, 5990, 7000]) expect(g.tap(t)).toBe('perfect');
    expect(g.getState()).toMatchObject({ status: 'finished', grades: ['perfect', 'perfect', 'perfect', 'perfect'], combo: 4, bestCombo: 4 });
    expect(g.accuracy).toBe(1);
    expect(g.heldBpm).toBeCloseTo(60, 5);
  });

  it('lệch vừa → Khá, lệch nhiều → Lệch (mất chuỗi); gõ quá sát bị bỏ', () => {
    const g = new SteadyBeatGame(cfg);
    g.start(0);
    expect(g.tap(4100)).toBe('good'); // +10%
    expect(g.tap(4200)).toBe('ignored'); // 0.1 phách
    expect(g.tap(5400)).toBe('off'); // +30%
    expect(g.getState()).toMatchObject({ grades: ['good', 'off'], combo: 0, bestCombo: 1 });
    expect(g.getState().lastDeviation).toBeCloseTo(0.3, 5);
  });

  it('bỏ sót một phách (khoảng ≈ 2 phách) → một phách bỏ sót, phần còn lại vẫn chấm', () => {
    const g = new SteadyBeatGame(cfg);
    g.start(0);
    g.tap(4000);
    expect(g.tap(6020)).toBe('perfect');
    expect(g.getState().grades).toEqual(['perfect', 'miss', 'perfect']);
    expect(g.hits).toBe(2);
  });

  it('ngừng gõ quá lâu → kết thúc, phách còn lại tính bỏ sót', () => {
    const g = new SteadyBeatGame(cfg);
    g.start(0);
    g.tap(4000);
    g.tick(6900);
    expect(g.getState().status).toBe('playing');
    g.tick(7100); // > 3 phách sau lần gõ cuối
    expect(g.getState()).toMatchObject({ status: 'finished', grades: ['perfect', 'miss', 'miss', 'miss'] });
    expect(g.accuracy).toBe(0.25);
  });
});
