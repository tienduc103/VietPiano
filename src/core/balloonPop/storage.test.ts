import { describe, expect, it } from 'vitest';
import { balloonKey, DEFAULT_BALLOON_SETTINGS, sanitizeBalloonSettings, totalBalloonStars } from './storage';

describe('Bóng bay storage', () => {
  it('cài đặt hỏng → mặc định; tay theo chế độ; ẩn phím chỉ giữ tên hợp lệ', () => {
    expect(sanitizeBalloonSettings(null)).toEqual(DEFAULT_BALLOON_SETTINGS);
    expect(sanitizeBalloonSettings({ mode: 'x', difficulty: 'siêu khó', speed: 'chậm', labelStyle: 'y' })).toMatchObject({ mode: 'one-hand', difficulty: 'easy', speed: 'medium', labelStyle: 'solfege' });
    expect(sanitizeBalloonSettings({ mode: 'one-hand', hand: 'both' }).hand).toBe('right');
    expect(sanitizeBalloonSettings({ mode: 'seven', hand: 'both' }).hand).toBe('both');
    expect(sanitizeBalloonSettings({ mode: 'full', hand: 'left' }).hand).toBe('both');
    expect(sanitizeBalloonSettings({ hiddenLetters: ['E', 'C', 'H', 3] }).hiddenLetters).toEqual(['C', 'E']);
  });

  it('khoá kỷ lục + tổng sao', () => {
    expect(balloonKey({ mode: 'one-hand', hand: 'left', difficulty: 'hard', speed: 'fast' })).toBe('one-hand-left:hard:fast');
    expect(balloonKey({ mode: 'full', hand: 'both', difficulty: 'easy', speed: 'medium' })).toBe('full:easy:medium');
    expect(totalBalloonStars({ a: { plays: 1, bestScore: 10, bestStars: 2 }, b: { plays: 3, bestScore: 5, bestStars: 3 } })).toBe(5);
  });
});
