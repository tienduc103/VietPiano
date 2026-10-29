import { describe, expect, it } from 'vitest';
import { intervalName, makeIntervalRounds } from './intervals';
import { seeded } from './random';

describe('intervals', () => {
  it('tên quãng theo số nửa cung', () => {
    expect(intervalName(4)).toBe('quãng 3 trưởng');
    expect(intervalName(7)).toBe('quãng 5 đúng');
    expect(intervalName(12)).toBe('quãng 8 đúng');
    expect(() => intervalName(13)).toThrow();
  });

  it('nốt gốc là phím trắng, nốt đích đúng quãng + hướng và nằm trong bàn phím', () => {
    const rounds = makeIntervalRounds({ from: 48, to: 83, intervals: [2, 3, 4, 5, 7], directions: ['up', 'down'] }, 200, seeded(7));
    expect(rounds).toHaveLength(200);
    for (const r of rounds) {
      expect([1, 3, 6, 8, 10]).not.toContain(r.root % 12);
      expect(r.target).toBe(r.root + (r.direction === 'up' ? r.semitones : -r.semitones));
      expect(r.target).toBeGreaterThanOrEqual(48);
      expect(r.target).toBeLessThanOrEqual(83);
    }
    expect(new Set(rounds.map((r) => r.semitones))).toEqual(new Set([2, 3, 4, 5, 7]));
    expect(new Set(rounds.map((r) => r.direction))).toEqual(new Set(['up', 'down']));
    rounds.slice(1).forEach((r, i) => expect(r).not.toEqual(rounds[i]));
  });

  it('không có lượt nào vừa bàn phím → báo lỗi', () => {
    expect(() => makeIntervalRounds({ from: 60, to: 64, intervals: [12], directions: ['up'] }, 3)).toThrow();
  });
});
