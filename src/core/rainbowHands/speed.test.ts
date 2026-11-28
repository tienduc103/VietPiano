import { describe, expect, it } from 'vitest';
import { sampleInterval, SpeedJudge, speedBand, speedFeedback, speedPlan, speedStats, SPEED_INFO, type SpeedId } from './speed';

describe('Nhanh – chậm', () => {
  it('dải tốc độ nối liền nhau; mức Dễ nới hai đầu; mẫu nằm giữa dải', () => {
    expect(SPEED_INFO['very-fast'].band[1]).toBe(SPEED_INFO.fast.band[0]);
    expect(SPEED_INFO.fast.band[1]).toBe(SPEED_INFO.slow.band[0]);
    expect(SPEED_INFO.slow.band[1]).toBe(SPEED_INFO['very-slow'].band[0]);
    expect(speedBand('slow', 'easy')).toEqual([640, 1875]);
    const s = sampleInterval('fast');
    expect(s).toBeGreaterThan(350);
    expect(s).toBeLessThan(800);
  });

  it('kế hoạch theo seed: mỗi chặng một tốc độ, chặng sau khác chặng trước', () => {
    const plan = speedPlan(15, 3, ['slow', 'fast', 'very-fast'], 4, 42);
    expect(plan).toEqual(speedPlan(15, 3, ['slow', 'fast', 'very-fast'], 4, 42));
    const flat = plan.flat();
    for (let i = 4; i < flat.length; i++) if (i % 15 % 4 === 0 || i % 15 === 0) expect(flat[i]).not.toBe(flat[i - 1]);
    for (const row of plan) for (let i = 1; i < row.length; i++) if (i % 4 !== 0) expect(row[i]).toBe(row[i - 1]);
    expect(new Set(speedPlan(8, 1, ['slow'], 4, 1).flat())).toEqual(new Set(['slow']));
  });

  const judge = (speeds: SpeedId[][], segment = 8) => new SpeedJudge(speeds, segment, { ease: 'normal', strikesToCatch: 3, okToHeal: 3 });
  const row = (id: SpeedId, n = 8) => Array.from({ length: n }, () => id);

  it('đúng / chậm quá / nhanh quá theo khoảng giữa hai lần bấm; bước đầu không chấm', () => {
    const j = judge([row('fast')]);
    expect(j.onStep(1, 0, 0).kind).toBe('free');
    expect(j.onStep(1, 1, 500).kind).toBe('ok');
    expect(j.onStep(1, 2, 1600)).toMatchObject({ kind: 'slow', hazard: 'crocodile', danger: 1 });
    expect(j.onStep(1, 3, 1700)).toMatchObject({ kind: 'fast', hazard: 'lightning', danger: 2 });
    // Lần thứ ba → bị bắt, nguy hiểm về 0.
    expect(j.onStep(1, 4, 1800)).toMatchObject({ kind: 'fast', caught: 'log', danger: 0 });
    expect(j.getCaught()).toEqual(['log']);
    const st = speedStats(j.getVerdicts());
    expect(st).toMatchObject({ graded: 4, ok: 1, slow: 1, fast: 2 });
  });

  it('chờ lâu → cá sấu đến NGAY lúc đang chờ, chỉ một lần; nốt đến muộn không tính thêm', () => {
    const j = judge([row('slow')]);
    j.onStep(1, 0, 0);
    expect(j.tick(1, 1, 1400)).toBeNull();
    expect(j.tick(1, 1, 1600)).toMatchObject({ kind: 'slow-live', hazard: 'crocodile', danger: 1 });
    expect(j.tick(1, 1, 3000)).toBeNull();
    expect(j.onStep(1, 1, 3200)).toMatchObject({ kind: 'slow', danger: 1, hazard: null });
  });

  it('tạm dừng không tính vào khoảng chờ', () => {
    const j = judge([row('slow')]);
    j.onStep(1, 0, 0);
    j.pause(500);
    expect(j.tick(1, 1, 5000)).toBeNull();
    j.resume(10_000);
    expect(j.onStep(1, 1, 10_800)).toMatchObject({ kind: 'ok', intervalMs: 1300 });
  });

  it('đầu chặng tốc độ mới và đầu vòng mới không chấm; đúng liền 3 lần bớt nguy hiểm', () => {
    const j = judge([[...row('slow', 4), ...row('fast', 4)]], 4);
    j.onStep(1, 0, 0);
    j.onStep(1, 1, 300); // nhanh quá khi cần chậm
    expect(j.getDanger()).toBe(1);
    j.onStep(1, 2, 1300);
    j.onStep(1, 3, 2300);
    expect(j.onStep(1, 4, 2400).kind).toBe('free'); // đổi sang nhanh
    expect(j.onStep(1, 5, 2900).kind).toBe('ok');
    expect(j.getDanger()).toBe(0);
    expect(j.onStep(2, 0, 9000).kind).toBe('free');
  });

  it('nhận xét chỉ dựa vào khoảng đã đo', () => {
    const j = judge([row('very-fast')]);
    [0, 500, 1000, 1500, 1700].forEach((t, i) => j.onStep(1, i, t));
    expect(speedFeedback(speedStats(j.getVerdicts()))).toBe('Con giữ đúng tốc độ 1/4 lần. Thật nhanh: con hay chậm quá — tập thêm nhé.');
    expect(speedFeedback(speedStats([]))).toBe('');
  });
});
