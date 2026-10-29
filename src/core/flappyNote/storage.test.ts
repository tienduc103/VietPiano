import { describe, expect, it } from 'vitest';
import { DEFAULT_FLAPPY_SETTINGS, flappyKey, rankFor, sanitizeFlappySettings, totalStars } from './storage';

describe('Flappy Note storage', () => {
  it('cài đặt hỏng / bản cũ → mặc định; màn không có giai điệu thì về chế độ ngẫu nhiên', () => {
    expect(sanitizeFlappySettings(null)).toEqual(DEFAULT_FLAPPY_SETTINGS);
    expect(sanitizeFlappySettings({ levelId: 'không-có', difficulty: 'siêu khó', showName: 'x' })).toMatchObject({ levelId: DEFAULT_FLAPPY_SETTINGS.levelId, difficulty: 'easy', showName: true });
    expect(sanitizeFlappySettings({ levelId: 'treble-wide', mode: 'sequence' }).mode).toBe('random');
    expect(sanitizeFlappySettings({ levelId: 'rh-c-position', mode: 'sequence', melodyId: 'mary' })).toMatchObject({ mode: 'sequence', melodyId: 'mary' });
    expect(sanitizeFlappySettings({ levelId: 'rh-c-position', melodyId: 'không-có' }).melodyId).toBe('five-steps');
  });

  it('tổng sao + danh hiệu', () => {
    const records = { [flappyKey('rh-do-re-mi', 'easy')]: { plays: 2, bestScore: 900, bestStars: 3 }, [flappyKey('rh-do-re-mi', 'hard')]: { plays: 1, bestScore: 500, bestStars: 1 } };
    expect(totalStars(records)).toBe(4);
    expect(rankFor(0).current.title).toBe('Trứng nhạc');
    expect(rankFor(4)).toMatchObject({ current: { stars: 3 }, next: { stars: 9 } });
    expect(rankFor(999).next).toBeUndefined();
  });
});
