import { describe, expect, it } from 'vitest';
import { learnedLetters, STARTER_LETTERS, suggestedHuntLetters, suggestedTomatoDifficulty } from './learnedNotes';
import type { LessonRecord } from './progress';
import type { Records } from './unlock';

const passed = (...ids: string[]): Records => Object.fromEntries(ids.map((id) => [id, { passed: true } as LessonRecord]));

describe('nốt đã học (gợi ý cho trò chơi tự do)', () => {
  it('chưa đạt buổi nốt nào → chưa học nốt nào, Bóng bay gợi ý Đô – Rê – Mi, cà chua dễ', () => {
    expect(learnedLetters({})).toEqual([]);
    expect(suggestedHuntLetters({})).toEqual([...STARTER_LETTERS]);
    expect(suggestedTomatoDifficulty({})).toBe('easy');
  });

  it('tính buổi nốt đã ĐẠT ở cả "Khám phá nốt nhạc" lẫn "Làm quen từng nốt", theo thứ tự Đô → Si', () => {
    const records = passed('sup-d', 'nd-c', 'nd-keyboard', 'l1-01-keyboard');
    expect(learnedLetters(records)).toEqual(['C', 'D']);
    expect(suggestedHuntLetters(records)).toEqual(['C', 'D']);
  });

  it('buổi mới làm mà chưa đạt không tính', () => {
    const records: Records = { 'nd-e': { passed: false, attempts: 2 } as LessonRecord };
    expect(learnedLetters(records)).toEqual([]);
  });

  it('độ khó cà chua: ≥ 4 nốt vừa, đủ 7 nốt khó', () => {
    expect(suggestedTomatoDifficulty(passed('nd-c', 'nd-d', 'nd-e'))).toBe('easy');
    expect(suggestedTomatoDifficulty(passed('nd-c', 'nd-d', 'nd-e', 'sup-f'))).toBe('medium');
    expect(suggestedTomatoDifficulty(passed('nd-c', 'nd-d', 'nd-e', 'nd-f', 'nd-g', 'nd-a', 'sup-b'))).toBe('hard');
  });
});
