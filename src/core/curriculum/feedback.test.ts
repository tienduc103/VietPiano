import { describe, expect, it } from 'vitest';
import { lessonFeedback, weakestCriterion } from './feedback';
import type { ExerciseScore } from './scoring';

const score = (criteria: ExerciseScore['criteria']): ExerciseScore => ({
  exerciseId: 'e',
  rubric: 'performance',
  score: 70,
  passed: false,
  accuracy: 1,
  completion: 1,
  criteria,
  mistakes: [],
});

describe('nhận xét cuối buổi', () => {
  const s = score([
    { key: 'pitch', label: '', value: 0.95, weight: 45 },
    { key: 'timing', label: '', value: 0.4, weight: 30 },
    { key: 'duration', label: '', value: null, weight: 15 },
  ]);

  it('tiêu chí yếu nhất bỏ qua tiêu chí không đo được', () => {
    expect(weakestCriterion([s])).toEqual({ key: 'timing', value: 0.4 });
    expect(weakestCriterion([])).toBeNull();
  });

  it('chưa đạt: nêu điểm và lời khuyên cho tiêu chí yếu nhất', () => {
    const lines = lessonFeedback({ score: 70, passed: false, missingRequired: ['e'], allAttempted: true }, [s], 'adult');
    expect(lines[0]).toBe('Chưa đạt: 70/100 điểm.');
    expect(lines[1]).toMatch(/metronome/);
  });

  it('Kids Mode: câu ngắn, vui', () => {
    expect(lessonFeedback({ score: 100, passed: true, missingRequired: [], allAttempted: true }, [], 'kids')[0]).toMatch(/Tuyệt vời/);
    expect(lessonFeedback({ score: 30, passed: false, missingRequired: ['e'], allAttempted: false }, [], 'kids')[0]).toMatch(/chưa làm/);
  });
});
