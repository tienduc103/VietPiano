import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { PerformanceResult } from '../practice/PerformanceTracker';
import { IndexedDbCurriculumStorage, MemoryCurriculumStorage } from '../storage/CurriculumStorage';
import { CURRICULUM } from './content/curriculum';
import { addPracticeTime, applyExerciseScore, applyLessonRun, emptyRecord, markActivitiesDone, sanitizeRecord, topMistakes } from './progress';
import { checkPass, EXTRA_KEY, formatMistake, missedNoteKey, questionKey, scoreLesson, scorePerformance, scoreQuiz, scoreRhythm, scoreWait, starsFor, weightedScore, wrongNoteKey } from './scoring';
import type { CurriculumLesson, Exercise } from './types';
import { achievements, currentLevel, lessonStatus, levelProgress, missingPrerequisites, nextLessonAfter } from './unlock';

const ex = (pass: Exercise['pass'], id = 'e'): Exercise => ({ kind: 'choice-quiz', id, title: id, questions: [], pass });
const perf = (over: Partial<PerformanceResult>): PerformanceResult => ({
  notes: 10,
  correct: 10,
  wrong: 0,
  missed: 0,
  extras: 0,
  pitchAccuracy: 1,
  timing: 1,
  duration: 1,
  completion: 1,
  onTimeRatio: 1,
  ...over,
});

describe('rubric chấm điểm', () => {
  it('lý thuyết / tìm phím: % đúng ngay lần đầu; đạt theo số lượt đúng tối thiểu (4/5)', () => {
    const s = scoreQuiz(ex({ minCorrect: 4 }), 'keyboard', { correct: 4, rounds: 5, answered: 5, mistakes: ['x'] });
    expect(s).toMatchObject({ score: 80, passed: true, accuracy: 0.8, completion: 1, mistakes: ['x'] });
    expect(scoreQuiz(ex({ minCorrect: 4 }), 'keyboard', { correct: 3, rounds: 5, answered: 5, mistakes: [] }).passed).toBe(false);
  });

  it('Wait Mode: 90% độ chính xác + 10% hoàn thành, KHÔNG có tiêu chí nhịp', () => {
    const s = scoreWait(ex({ minAccuracy: 0.85 }), { correct: 17, wrong: 3, notes: 17, reached: 17, mistakes: [] });
    expect(s.criteria.map((c) => c.key)).toEqual(['accuracy', 'completion']);
    expect(s.accuracy).toBeCloseTo(0.85);
    expect(s.score).toBe(Math.round(90 * 0.85 + 10));
    expect(s.passed).toBe(true);
    expect(scoreWait(ex({ minAccuracy: 0.85 }), { correct: 16, wrong: 4, notes: 16, reached: 16, mistakes: [] }).passed).toBe(false);
  });

  it('Biểu diễn: 45 nốt / 30 nhịp / 15 trường độ / 10 hoàn thành', () => {
    const s = scorePerformance(ex({ minScore: 80 }), perf({ pitchAccuracy: 0.8, timing: 0.5, duration: 1, completion: 1 }), []);
    expect(s.score).toBe(Math.round(45 * 0.8 + 30 * 0.5 + 15 + 10));
    expect(s.criteria.map((c) => [c.key, c.weight])).toEqual([
      ['pitch', 45],
      ['timing', 30],
      ['duration', 15],
      ['completion', 10],
    ]);
  });

  it('Biểu diễn bằng micro (không đo được trường độ): chia lại trọng số cho tiêu chí còn lại', () => {
    const s = scorePerformance(ex({}), perf({ pitchAccuracy: 1, timing: 0, duration: null, completion: 1 }), []);
    // (45 + 10) / 85
    expect(s.score).toBe(Math.round((55 / 85) * 100));
  });

  it('điều kiện đạt biểu diễn: điểm ≥ 80, nốt ≥ 80%, hoàn thành ≥ 90%', () => {
    const rule = { minScore: 80, minAccuracy: 0.8, minCompletion: 0.9 };
    expect(scorePerformance(ex(rule), perf({}), []).passed).toBe(true);
    expect(scorePerformance(ex(rule), perf({ pitchAccuracy: 0.75 }), []).passed).toBe(false);
    expect(scorePerformance(ex(rule), perf({ completion: 0.85 }), []).passed).toBe(false);
    expect(scorePerformance(ex(rule), perf({ timing: 0.2 }), []).passed).toBe(false);
  });

  it('tiết tấu: chỉ nhịp + trường độ + hoàn thành', () => {
    const s = scoreRhythm(ex({}), perf({ pitchAccuracy: 0, timing: 1, duration: null, completion: 1 }), []);
    expect(s.score).toBe(100);
    expect(s.criteria.some((c) => c.key === 'pitch')).toBe(false);
  });

  it('lỗi hay gặp: khoá ổn định, hiển thị theo kiểu tên nốt', () => {
    expect(formatMistake(wrongNoteKey('C4', 'D4'), 'letter')).toBe('Cần C4, bạn đánh D4');
    expect(formatMistake(wrongNoteKey('C4', 'C#4'), 'solfege')).toBe('Cần Đô4, bạn đánh Đô#4');
    expect(formatMistake(missedNoteKey('E4'), 'solfege')).toBe('Lỡ nốt Mi4');
    expect(formatMistake(EXTRA_KEY, 'letter')).toMatch(/Gõ thừa/);
    expect(formatMistake(questionKey('Ngón cái là ngón số mấy?'), 'letter')).toBe('Trả lời sai: Ngón cái là ngón số mấy?');
    expect(formatMistake('khác', 'letter')).toBe('khác');
  });

  it('tiện ích', () => {
    expect(weightedScore([])).toBe(0);
    expect(checkPass({ minCompletion: 1 }, { score: 100, accuracy: 1, completion: 0.99 })).toBe(false);
    expect([starsFor(0), starsFor(50), starsFor(85), starsFor(97)]).toEqual([0, 1, 2, 3]);
  });
});

const lesson: CurriculumLesson = {
  lessonId: 'L',
  levelId: 'level-1',
  weekId: 'w',
  number: 1,
  title: 'L',
  description: '',
  learningObjectives: ['x'],
  estimatedDuration: 5,
  ageVariants: {},
  prerequisites: [],
  activities: [],
  exercises: [{ ...ex({}, 'warm'), required: false, weight: 0 }, ex({ minAccuracy: 0.8 }, 'a'), { ...ex({}, 'b'), weight: 2 }],
  assessment: { passScore: 80, checkpoint: false },
  unlockCriteria: { lessonsPassed: [] },
  contentVersion: 1,
};

describe('điểm buổi học', () => {
  it('trung bình có trọng số; bài luyện tập (weight 0) không tính; phải đạt mọi bài bắt buộc', () => {
    const r = scoreLesson(lesson, { warm: { score: 0, passed: false }, a: { score: 90, passed: true }, b: { score: 75, passed: true } });
    expect(r.score).toBe(80);
    expect(r.passed).toBe(true);
    expect(scoreLesson(lesson, { a: { score: 100, passed: false }, b: { score: 100, passed: true } })).toMatchObject({ passed: false, missingRequired: ['a'] });
    expect(scoreLesson(lesson, { a: { score: 70, passed: true }, b: { score: 70, passed: true } }).passed).toBe(false);
    expect(scoreLesson(lesson, { a: { score: 70, passed: true } }).allAttempted).toBe(false);
  });

  it('buổi chỉ có giới thiệu: đạt khi xem xong', () => {
    expect(scoreLesson({ ...lesson, exercises: [] }, {}, false).passed).toBe(false);
    expect(scoreLesson({ ...lesson, exercises: [] }, {}, true)).toMatchObject({ passed: true, score: 100 });
  });
});

describe('tiến độ (lưu ngay sau mỗi bài tập)', () => {
  const quiz = (id: string, score: number, passed: boolean, mistakes: string[] = []) => ({ ...scoreQuiz(ex({}, id), 'theory', { correct: 0, rounds: 1, answered: 1, mistakes }), score, passed });

  it('điểm cao nhất / gần nhất, số lần, thời gian, lỗi hay gặp, đạt rồi thì giữ', () => {
    let rec = emptyRecord('p1', lesson);
    rec = applyExerciseScore(rec, lesson, quiz('a', 60, false, ['C4→D4']), 30_000, 1);
    expect(rec.passed).toBe(false);
    rec = applyExerciseScore(rec, lesson, quiz('a', 95, true, ['C4→D4', 'E4→F4']), 20_000, 2);
    rec = applyExerciseScore(rec, lesson, quiz('b', 80, true), 10_000, 3);
    expect(rec.exercises.a).toEqual({ attempts: 2, bestScore: 95, lastScore: 95, passed: true });
    expect(rec.passed).toBe(true);
    expect(rec.passedAt).toBe(3);
    expect(rec.practiceMs).toBe(60_000);
    expect(topMistakes(rec)).toEqual([
      { key: 'C4→D4', count: 2 },
      { key: 'E4→F4', count: 1 },
    ]);
    // Luyện lại điểm thấp: không mất trạng thái đạt, điểm cao nhất giữ nguyên.
    rec = applyExerciseScore(rec, lesson, quiz('a', 10, false), 0, 4);
    expect(rec.passed).toBe(true);
    expect(rec.exercises.a).toMatchObject({ bestScore: 95, lastScore: 10, passed: true });
    rec = applyLessonRun(rec, 70, 5);
    rec = applyLessonRun(rec, 88, 6);
    expect(rec).toMatchObject({ attempts: 2, bestScore: 88, lastScore: 88 });
    expect(addPracticeTime(rec, 5000, 7).practiceMs).toBe(65_000);
    expect(addPracticeTime(rec, -1, 7)).toBe(rec);
  });

  it('buổi chỉ có giới thiệu đạt khi đánh dấu xem xong', () => {
    const intro = { ...lesson, exercises: [] };
    expect(markActivitiesDone(emptyRecord('p', intro), intro, 9)).toMatchObject({ passed: true, activitiesDone: true, passedAt: 9 });
  });

  it('đọc bản ghi hỏng an toàn', () => {
    expect(sanitizeRecord(null)).toBeNull();
    expect(sanitizeRecord({ lessonId: 'x' })).toBeNull();
    expect(sanitizeRecord({ profileKey: 'p', lessonId: 'x', exercises: { a: { bestScore: 'nan' } }, mistakes: { k: -1 } })).toMatchObject({
      key: 'p|x',
      attempts: 0,
      exercises: { a: { attempts: 0, bestScore: 0, lastScore: 0, passed: false } },
      mistakes: {},
    });
  });

  it.each([
    ['IndexedDB', () => new IndexedDbCurriculumStorage(new IDBFactory())],
    ['bộ nhớ', () => new MemoryCurriculumStorage()],
  ])('lưu và khôi phục tiến độ theo từng người học (%s)', async (_name, make) => {
    const storage = make();
    let a = emptyRecord('p1', lesson);
    a = applyExerciseScore(a, lesson, quiz('a', 90, true, ['C4→D4']), 1000, 1);
    await storage.put(a);
    await storage.put(emptyRecord('p2', lesson));
    const restored = await storage.getAll('p1');
    expect(restored.L).toEqual(a);
    expect(Object.keys(await storage.getAll('p2'))).toEqual(['L']);
    await storage.clear('p1');
    expect(await storage.getAll('p1')).toEqual({});
    expect(Object.keys(await storage.getAll('p2'))).toEqual(['L']);
    await storage.clear();
    expect(await storage.getAll('p2')).toEqual({});
  });

  it('IndexedDB: dữ liệu còn sau khi mở lại (tải lại trang)', async () => {
    const factory = new IDBFactory();
    const rec = applyExerciseScore(emptyRecord('p1', lesson), lesson, quiz('a', 90, true), 0, 1);
    await new IndexedDbCurriculumStorage(factory).put(rec);
    expect((await new IndexedDbCurriculumStorage(factory).getAll('p1')).L).toEqual(rec);
  });
});

describe('trạng thái buổi / mở khoá (chỉ gợi ý)', () => {
  const level = CURRICULUM.levels[0];
  const [l1, l2, l3] = level.weeks[0].lessonIds.map((id) => level.lessons.find((l) => l.lessonId === id)!);
  const passed = (l: CurriculumLesson) => ({ ...emptyRecord('p', l), passed: true });

  it('buổi đầu sẵn sàng; buổi sau "nên học sau" tới khi buổi trước đạt', () => {
    expect(lessonStatus(l1, {})).toBe('available');
    expect(lessonStatus(l2, {})).toBe('suggest-later');
    expect(missingPrerequisites(l2, {})).toEqual([l1.lessonId]);
    const records = { [l1.lessonId]: passed(l1) };
    expect(lessonStatus(l1, records)).toBe('completed');
    expect(lessonStatus(l2, records)).toBe('available');
    // Làm buổi 3 khi chưa đạt buổi 2 vẫn được (không khoá cứng) → đang học.
    expect(lessonStatus(l3, { [l3.lessonId]: { ...emptyRecord('p', l3), attempts: 1 } })).toBe('in-progress');
  });

  it('tiến độ cấp, buổi nên học tiếp, cấp đang học, buổi kế tiếp', () => {
    expect(levelProgress(level, {})).toMatchObject({ completed: 0, total: 20, next: l1 });
    expect(levelProgress(level, { [l1.lessonId]: passed(l1) }).next).toBe(l2);
    expect(currentLevel(CURRICULUM, {})?.levelId).toBe('level-1');
    expect(nextLessonAfter(CURRICULUM, l1.lessonId)?.lessonId).toBe(l2.lessonId);
    expect(nextLessonAfter(CURRICULUM, 'l1-05-week1-test')?.lessonId).toBe('l1-06-staff');
    // Hết cấp 1 → buổi đầu cấp 2; hết cấp 2 (cấp 3 chưa có nội dung) → hết.
    expect(nextLessonAfter(CURRICULUM, 'l1-20-final')?.lessonId).toBe('l2-01-g-position');
    expect(nextLessonAfter(CURRICULUM, 'l2-20-final')).toBeNull();
    const all = Object.fromEntries(level.lessons.map((l) => [l.lessonId, passed(l)]));
    expect(levelProgress(level, all)).toMatchObject({ completed: 20, next: null });
    // Xong cấp 1 → cấp đang học là cấp 2.
    expect(currentLevel(CURRICULUM, all)?.levelId).toBe('level-2');
  });

  it('thành tích suy từ tiến độ', () => {
    const none = achievements(CURRICULUM, {});
    expect(none.every((a) => !a.earned)).toBe(true);
    const week1 = Object.fromEntries(level.weeks[0].lessonIds.map((id) => [id, passed(level.lessons.find((l) => l.lessonId === id)!)]));
    const got = achievements(CURRICULUM, week1);
    expect(got.find((a) => a.id === 'first-lesson')?.earned).toBe(true);
    expect(got.find((a) => a.id === 'l1-w1-done')?.earned).toBe(true);
    expect(got.find((a) => a.id === 'l1-w2-done')?.earned).toBe(false);
  });
});
