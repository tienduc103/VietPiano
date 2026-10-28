import { describe, expect, it } from 'vitest';
import { RhythmTrainGame, type RhythmBeat } from './RhythmTrainGame';

// Nốt đen – nốt đen – dấu lặng đen – nốt đen (4/4); 60 BPM → 1 phách = 1000 ms.
const PATTERN: RhythmBeat[] = [
  { startBeat: 0, durationBeats: 1, rest: false },
  { startBeat: 1, durationBeats: 1, rest: false },
  { startBeat: 2, durationBeats: 1, rest: true },
  { startBeat: 3, durationBeats: 1, rest: false },
];
const CFG = { bpm: 60, loops: 1, tempoStep: 0.5, countInBeats: 4, perfectMs: 100, goodMs: 250, minIntervalMs: 50 };

describe('RhythmTrainGame', () => {
  it('lịch: đếm vào một ô nhịp rồi tới mẫu; vòng sau nhanh hơn', () => {
    const g = new RhythmTrainGame(PATTERN, { ...CFG, loops: 2 });
    g.start(0);
    const s = g.getState();
    expect(s.wagons.filter((w) => w.loop === 0).map((w) => w.at)).toEqual([4000, 5000, 6000, 7000]);
    // Vòng 2: 90 BPM (×1.5) → phách 666.7 ms; đếm vào bắt đầu lúc 8000.
    const l2 = s.wagons.filter((w) => w.loop === 1).map((w) => Math.round(w.at));
    expect(l2).toEqual([10667, 11333, 12000, 12667]);
    expect(s.beats.filter((b) => b.countIn)).toHaveLength(8);
    expect(g.total).toBe(6);
  });

  it('Perfect / Good theo độ lệch; ngoài cửa sổ Good thì không tính trúng', () => {
    const g = new RhythmTrainGame(PATTERN, CFG);
    g.start(0);
    expect(g.answer(4050)).toBe('perfect');
    expect(g.answer(4800)).toBe('good'); // sớm 200 ms so với nốt 2
    expect(g.getState()).toMatchObject({ perfect: 1, good: 1, combo: 2, lastOffset: -200, score: 100 + 60 });
    expect(g.answer(7400)).toBe('stray'); // trễ 400 ms — quá cửa sổ
    expect(g.getState().combo).toBe(0);
  });

  it('gõ trong ô dấu lặng → phanh gấp: mất chuỗi, trừ điểm, ô lặng bị hỏng', () => {
    const g = new RhythmTrainGame(PATTERN, CFG);
    g.start(0);
    g.answer(4000);
    g.answer(5000);
    expect(g.answer(6500)).toBe('rest');
    const s = g.getState();
    expect(s).toMatchObject({ broken: 1, combo: 0, score: 210 - 30 });
    expect(s.wagons[2].result).toBe('broken');
  });

  it('nốt quá cửa sổ → trượt; ô lặng qua hết không bị gõ → giữ được; hết mẫu → kết thúc', () => {
    const g = new RhythmTrainGame(PATTERN, CFG);
    g.start(0);
    g.answer(4000);
    g.tick(5300);
    expect(g.getState()).toMatchObject({ misses: 1, lastOutcome: 'miss' });
    g.tick(7000);
    expect(g.getState().wagons[2].result).toBe('clean');
    g.answer(7000);
    expect(g.getState().status).toBe('finished');
    expect(g.accuracy).toBeCloseTo(2 / 3);
  });

  it('một lần gõ chỉ trúng một nốt; lần gõ quá sát bị bỏ', () => {
    const g = new RhythmTrainGame(PATTERN, CFG);
    g.start(0);
    expect(g.answer(4000)).toBe('perfect');
    expect(g.answer(4020)).toBe('ignored');
    expect(g.answer(4100)).toBe('stray');
    expect(g.getState().perfect).toBe(1);
  });

  it('mẫu chỉ có dấu lặng thì báo lỗi', () => {
    expect(() => new RhythmTrainGame([{ startBeat: 0, durationBeats: 4, rest: true }])).toThrow();
  });
});
