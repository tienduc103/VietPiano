import { describe, expect, it } from 'vitest';
import { balloonKey, DEFAULT_BALLOON_SETTINGS, nextDisplay, sanitizeBalloonSettings, totalBalloonStars } from './storage';

describe('Bóng bay storage', () => {
  it('cài đặt hỏng → mặc định; tay theo chế độ; ẩn phím chỉ giữ tên hợp lệ', () => {
    expect(sanitizeBalloonSettings(null)).toEqual(DEFAULT_BALLOON_SETTINGS);
    expect(sanitizeBalloonSettings({ mode: 'x', difficulty: 'siêu khó', speed: 'chậm', labelStyle: 'y' })).toMatchObject({ mode: 'one-hand', difficulty: 'easy', speed: 'medium', labelStyle: 'solfege' });
    expect(sanitizeBalloonSettings({ mode: 'one-hand', hand: 'both' }).hand).toBe('right');
    expect(sanitizeBalloonSettings({ mode: 'seven', hand: 'both' }).hand).toBe('both');
    expect(sanitizeBalloonSettings({ mode: 'full', hand: 'left' }).hand).toBe('both');
    expect(sanitizeBalloonSettings({ hiddenLetters: ['E', 'C', 'H', 3] }).hiddenLetters).toEqual(['C', 'E']);
    // Bản cũ chưa có `display` → theo kiểu tên đã chọn.
    expect(sanitizeBalloonSettings({ labelStyle: 'letter' })).toMatchObject({ display: 'letter', labelStyle: 'letter' });
    expect(sanitizeBalloonSettings({ display: 'ear', labelStyle: 'letter' })).toMatchObject({ display: 'ear', labelStyle: 'letter' });
  });

  it('nút hiển thị xoay vòng Đô Rê Mi → CDEFGAB → Hình nốt → ? → Đô Rê Mi; tên phím theo chế độ chữ gần nhất', () => {
    let s = nextDisplay({ display: 'solfege', labelStyle: 'solfege' });
    expect(s).toEqual({ display: 'letter', labelStyle: 'letter' });
    s = nextDisplay(s);
    expect(s).toEqual({ display: 'staff', labelStyle: 'letter' });
    s = nextDisplay(s);
    expect(s).toEqual({ display: 'ear', labelStyle: 'letter' });
    expect(nextDisplay(s)).toEqual({ display: 'solfege', labelStyle: 'solfege' });
  });

  it('khoá kỷ lục + tổng sao', () => {
    expect(balloonKey({ mode: 'one-hand', hand: 'left', difficulty: 'hard', speed: 'fast' })).toBe('one-hand-left:hard:fast');
    expect(balloonKey({ mode: 'full', hand: 'both', difficulty: 'easy', speed: 'medium' })).toBe('full:easy:medium');
    expect(totalBalloonStars({ a: { plays: 1, bestScore: 10, bestStars: 2 }, b: { plays: 3, bestScore: 5, bestStars: 3 } })).toBe(5);
  });
});
