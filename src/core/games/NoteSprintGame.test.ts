import { describe, expect, it } from 'vitest';
import { NoteSprintGame, sprintStars } from './NoteSprintGame';
import { seeded } from './random';

describe('NoteSprintGame', () => {
  it('đúng → điểm + chuỗi, sang nốt khác; sai → trừ giây, vẫn ở nốt đó', () => {
    const g = new NoteSprintGame([60, 62, 64], { durationMs: 10_000, penaltyMs: 2000, minIntervalMs: 200 }, seeded(1));
    g.start(0);
    const first = g.getState().current;
    expect(g.answer(first, 100)).toBe('hit');
    const second = g.getState().current;
    expect(second).not.toBe(first);
    expect(g.answer(second, 400)).toBe('hit');
    expect(g.getState()).toMatchObject({ hits: 2, combo: 2, score: 100 + 110 });
    const before = g.getState().current;
    const wrong = [60, 62, 64].find((m) => m !== before)!;
    expect(g.answer(wrong, 700)).toBe('wrong');
    expect(g.getState()).toMatchObject({ current: before, combo: 0, wrongs: 1, endsAt: 8000 });
  });

  it('sự kiện quá sát lần chuyển nốt bị bỏ (micro phát lặp)', () => {
    const g = new NoteSprintGame([60, 62], { minIntervalMs: 200 }, seeded(2));
    g.start(0);
    g.answer(g.getState().current, 100);
    expect(g.answer(g.getState().current, 150)).toBe('ignored');
    expect(g.getState().hits).toBe(1);
  });

  it('hết giờ → kết thúc; đánh sai lúc gần hết giờ có thể kết thúc ngay', () => {
    const g = new NoteSprintGame([60, 62], { durationMs: 5000, penaltyMs: 3000 }, seeded(3));
    g.start(0);
    g.tick(4999);
    expect(g.getState().status).toBe('playing');
    const wrong = g.getState().current === 60 ? 62 : 60;
    g.answer(wrong, 2500); // 5000 − 3000 = 2000 < 2500
    expect(g.getState().status).toBe('finished');
    expect(g.answer(60, 2600)).toBe('ignored');
    expect(g.remaining(2600)).toBe(0);
  });

  it('sao theo số nốt đúng', () => {
    expect(sprintStars(0, [5, 10, 15])).toBe(0);
    expect(sprintStars(5, [5, 10, 15])).toBe(1);
    expect(sprintStars(14, [5, 10, 15])).toBe(2);
    expect(sprintStars(30, [5, 10, 15])).toBe(3);
  });

  it('cần ít nhất hai nốt khác nhau', () => {
    expect(() => new NoteSprintGame([60, 60])).toThrow();
  });
});
